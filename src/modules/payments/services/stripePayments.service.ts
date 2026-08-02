import Stripe from 'stripe';
import mongoose from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { PaymentModel, PaymentType } from '../models/payment.model';
import { StripeWebhookEventModel } from '../models/stripeWebhookEvent.model';
import { findOrCreateCreditAccount } from '../../ledger/services/ledgerService';
import { createCreditEventWithIdempotency } from '../../ledger/services/idempotencyService';
import { CreditEventType } from '../../ledger/types/creditEventTypes';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { UnitModel } from '../../units/models/unit.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { createLedgerEntryFromStripePaymentIdempotent } from '../../ledger/services/tokenLedger.service';
import { User } from '../../auth/models/user.model';
import { createLandlordAllocation } from './landlordAllocation.service';
import { LandlordAllocationModel } from '../models/landlordAllocation.model';
import { dispatchCampaignRewardsSafe } from '../../campaign/services/campaignDispatch.service';
import { notify } from '../../notifications/services/notification.service';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const STRIPE_CURRENCY = (process.env.STRIPE_CURRENCY || 'usd').toLowerCase();
const TOKENS_PER_CURRENCY_UNIT = Number(process.env.TOKENS_PER_CURRENCY_UNIT || '1');

let stripeClient: any = null;

function getStripeClient(): any {
  if (!STRIPE_SECRET_KEY) {
    throw new AppError('Stripe is not configured (missing STRIPE_SECRET_KEY)', 500);
  }
  if (!stripeClient) {
    stripeClient = new Stripe(STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

function asStripeAmount(amount: number): number {
  return Math.round(amount * 100);
}

function getAccruedTokensFromAmount(amount: number): number {
  const raw = amount * TOKENS_PER_CURRENCY_UNIT;
  return Math.max(0, Math.floor(raw));
}

async function findOrCreateStripeCustomer(tenantUserId: mongoose.Types.ObjectId): Promise<string> {
  const stripe = getStripeClient();
  const user = await User.findById(tenantUserId).select('email stripeCustomerId profile').lean();
  if (!user) throw new AppError('Tenant user not found', 404);

  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const name = [user.profile?.firstName, user.profile?.lastName].filter(Boolean).join(' ') || undefined;
  const customer = await stripe.customers.create({
    email: user.email,
    ...(name ? { name } : {}),
    metadata: { tenantUserId: tenantUserId.toString() },
  });

  await User.updateOne({ _id: tenantUserId }, { $set: { stripeCustomerId: customer.id } });
  return customer.id;
}

type TenancyRowForScope = {
  _id: mongoose.Types.ObjectId;
  unitId: mongoose.Types.ObjectId;
  rentAmount: number;
};

async function scopeFromTenancyRow(tenancy: TenancyRowForScope): Promise<{
  tenancyId: mongoose.Types.ObjectId;
  unitId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  rentAmount: number;
}> {
  const unit = await UnitModel.findById(tenancy.unitId).lean();
  if (!unit) {
    throw new AppError('Unit not found for active tenancy', 404);
  }

  const property = await PropertyModel.findById(unit.propertyId).lean();
  if (!property) {
    throw new AppError('Property not found for active tenancy', 404);
  }

  return {
    tenancyId: tenancy._id,
    unitId: unit._id,
    propertyId: unit.propertyId,
    orgId: property.orgId,
    rentAmount: tenancy.rentAmount,
  };
}

async function resolveTenantScope(
  tenantUserId: mongoose.Types.ObjectId,
  explicitTenancyId?: string | null
): Promise<{
  tenancyId: mongoose.Types.ObjectId;
  unitId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  rentAmount: number;
}> {
  if (explicitTenancyId) {
    if (!mongoose.Types.ObjectId.isValid(explicitTenancyId)) {
      throw new AppError('Invalid tenancyId', 400);
    }
    const tenancy = await TenancyModel.findOne({
      _id: new mongoose.Types.ObjectId(explicitTenancyId),
      tenantUserId,
      status: 'ACTIVE',
    }).lean();

    if (!tenancy) {
      throw new AppError('Tenancy not found, not active, or does not belong to this tenant', 404);
    }

    return scopeFromTenancyRow(tenancy as TenancyRowForScope);
  }

  const active = await TenancyModel.find({ tenantUserId, status: 'ACTIVE' }).sort({ createdAt: -1 }).lean();

  if (active.length === 0) {
    throw new AppError('No active tenancy found for tenant', 404);
  }

  if (active.length > 1) {
    throw new AppError(
      'Multiple active tenancies — send tenancyId in the body so the payment applies to the correct lease.',
      400
    );
  }

  return scopeFromTenancyRow(active[0] as TenancyRowForScope);
}

async function markPaymentFailed(stripePaymentIntentId: string): Promise<void> {
  const payment = await PaymentModel.findOne({ stripePaymentIntentId }).lean();
  if (!payment) {
    return;
  }

  if (payment.status === 'FAILED') {
    return;
  }

  await PaymentModel.updateOne(
    { _id: payment._id },
    {
      $set: {
        status: 'FAILED',
        method: 'stripe',
      },
    }
  );

  notify({
    recipientId: payment.tenantUserId,
    recipientRole: 'tenant',
    propertyId: payment.propertyId,
    unitId: payment.unitId,
    tenantId: payment.tenantUserId,
    eventType: 'PAYMENT_STATUS_CHANGED',
    eventTitle: 'Payment failed',
    eventDescription: `Your payment of $${payment.amount} could not be processed.`,
  });
}

async function markPaymentRefunded(stripeChargeId: string, refundAmount: number): Promise<void> {
  const payment = await PaymentModel.findOne({
    $or: [{ stripePaymentIntentId: stripeChargeId }, { 'metadata.stripeChargeId': stripeChargeId }],
  }).lean();

  if (!payment) return;
  if (payment.status === 'REFUNDED') return;

  const refundedAt = new Date();

  await PaymentModel.updateOne(
    { _id: payment._id },
    { $set: { status: 'REFUNDED', refundedAt, refundAmount } }
  );

  await LandlordAllocationModel.updateOne(
    { paymentId: payment._id },
    { $set: { status: 'SETTLED', settledAt: refundedAt, netAmount: 0, platformFee: 0 } }
  );

  notify({
    recipientId: payment.tenantUserId,
    recipientRole: 'tenant',
    propertyId: payment.propertyId,
    unitId: payment.unitId,
    tenantId: payment.tenantUserId,
    eventType: 'PAYMENT_STATUS_CHANGED',
    eventTitle: 'Payment refunded',
    eventDescription: `Your payment of $${payment.amount} was refunded.`,
  });

  const creditsToReverse = payment.incentivesEarnedCredits ?? 0;
  if (creditsToReverse > 0) {
    const account = await findOrCreateCreditAccount({
      tenantUserId: payment.tenantUserId.toString(),
      orgId: payment.orgId.toString(),
      unitId: payment.unitId.toString(),
    });

    await createCreditEventWithIdempotency(
      {
        accountId: (account as any)._id as mongoose.Types.ObjectId,
        type: CreditEventType.DEBIT,
        amount: creditsToReverse,
        occurredAt: refundedAt,
        description: `Credit reversal due to refund on payment ${payment._id.toString()}`,
        referenceId: payment._id,
      },
      `stripe:refund:${stripeChargeId}:debit:${payment._id.toString()}`
    );
  }
}

async function markPaymentPaidAndAccrueTokens(stripePaymentIntentId: string): Promise<void> {
  const payment = await PaymentModel.findOne({ stripePaymentIntentId }).lean();
  if (!payment) {
    throw new AppError(`Payment not found for stripe intent ${stripePaymentIntentId}`, 404);
  }

  const tokenAmount = getAccruedTokensFromAmount(payment.amount);
  const account = await findOrCreateCreditAccount({
    tenantUserId: payment.tenantUserId.toString(),
    orgId: payment.orgId.toString(),
    unitId: payment.unitId.toString(),
  });

  await createCreditEventWithIdempotency(
    {
      accountId: (account as any)._id as mongoose.Types.ObjectId,
      type: CreditEventType.CREDIT,
      amount: tokenAmount,
      occurredAt: new Date(),
      description: `Auto accrual from ${payment.type} payment`,
      referenceId: payment._id,
    },
    `stripe:${stripePaymentIntentId}:credit:${payment._id.toString()}`
  );

  const paidAt = new Date();
  await createLedgerEntryFromStripePaymentIdempotent({
    propertyId: payment.propertyId.toString(),
    tenantId: payment.tenantUserId.toString(),
    period: payment.period,
    paidAt,
    amount: payment.amount,
    tokenAmount,
    stripePaymentIntentId,
  });

  await createLandlordAllocation({
    paymentId: payment._id,
    tenantUserId: payment.tenantUserId,
    orgId: payment.orgId,
    propertyId: payment.propertyId,
    unitId: payment.unitId,
    period: payment.period,
    grossAmount: payment.amount,
  });

  void dispatchCampaignRewardsSafe({
    orgId: payment.orgId.toString(),
    triggerEvent: 'RENT_PAYMENT_PAID',
    tenantUserId: payment.tenantUserId.toString(),
    unitId: payment.unitId.toString(),
    propertyId: payment.propertyId.toString(),
    correlationId: stripePaymentIntentId,
  });

  await PaymentModel.updateOne(
    { _id: payment._id },
    {
      $set: {
        status: 'PAID',
        paidAt,
        method: 'stripe',
        incentivesEarnedCredits: tokenAmount,
      },
    }
  );

  notify({
    recipientId: payment.tenantUserId,
    recipientRole: 'tenant',
    propertyId: payment.propertyId,
    unitId: payment.unitId,
    tenantId: payment.tenantUserId,
    eventType: 'PAYMENT_STATUS_CHANGED',
    eventTitle: 'Payment received',
    eventDescription: `Your payment of $${payment.amount} was received.`,
  });
}

export async function createStripePaymentIntent(input: {
  tenantUserId: mongoose.Types.ObjectId;
  amount?: number;
  type: PaymentType;
  period?: string;
  tenancyId?: string | null;
}): Promise<{
  paymentId: string;
  clientSecret: string;
  stripePaymentIntentId: string;
  tenancyId: string;
  unitId: string;
  propertyId: string;
  orgId: string;
  period: string;
  amount: number;
}> {
  const scope = await resolveTenantScope(input.tenantUserId, input.tenancyId);

  let amount: number;
  if (input.type === 'RENT') {
    amount = scope.rentAmount;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new AppError(
        'Lease rent amount is missing or invalid; update tenancy.rentAmount before collecting rent.',
        400
      );
    }
  } else {
    if (input.amount == null || input.amount <= 0) {
      throw new AppError('amount must be greater than zero', 400);
    }
    amount = input.amount;
  }

  const stripe = getStripeClient();

  const dueDate = new Date();
  const period = input.period || `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}`;

  let payment;
  try {
    payment = await PaymentModel.create({
      tenantUserId: input.tenantUserId,
      tenancyId: scope.tenancyId,
      unitId: scope.unitId,
      propertyId: scope.propertyId,
      orgId: scope.orgId,
      period,
      amount,
      type: input.type,
      status: 'DUE',
      dueDate,
      method: 'stripe',
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      // Payment record already exists for this tenancy+period — resume the unpaid one if present
      const existing = await PaymentModel.findOne({
        tenancyId: scope.tenancyId,
        period,
        type: input.type,
        status: { $in: ['DUE', 'LATE', 'FAILED'] },
      }).lean();

      if (!existing) {
        const paid = await PaymentModel.findOne({
          tenancyId: scope.tenancyId,
          period,
          type: input.type,
          status: { $in: ['PAID', 'REFUNDED'] },
        }).lean();
        if (paid) {
          throw new AppError(`Rent for ${period} has already been paid.`, 409);
        }
        throw new AppError(`A ${input.type.toLowerCase()} payment already exists for period ${period}`, 409);
      }

      const stripeResume = getStripeClient();

      if (existing.stripePaymentIntentId) {
        const intent = await stripeResume.paymentIntents.retrieve(existing.stripePaymentIntentId);
        if (intent.status !== 'canceled' && intent.status !== 'succeeded') {
          return {
            paymentId: (existing as any)._id.toString(),
            clientSecret: intent.client_secret || '',
            stripePaymentIntentId: existing.stripePaymentIntentId,
            tenancyId: scope.tenancyId.toString(),
            unitId: scope.unitId.toString(),
            propertyId: scope.propertyId.toString(),
            orgId: scope.orgId.toString(),
            period,
            amount: existing.amount,
          };
        }
      }

      const resumeCustomerId = await findOrCreateStripeCustomer(input.tenantUserId);
      const freshIntent = await stripeResume.paymentIntents.create({
        amount: asStripeAmount(existing.amount),
        currency: STRIPE_CURRENCY,
        customer: resumeCustomerId,
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        metadata: {
          paymentId: (existing as any)._id.toString(),
          tenantUserId: input.tenantUserId.toString(),
          tenancyId: scope.tenancyId.toString(),
          unitId: scope.unitId.toString(),
          propertyId: scope.propertyId.toString(),
          orgId: scope.orgId.toString(),
          period,
          type: input.type,
        },
      });
      await PaymentModel.updateOne(
        { _id: (existing as any)._id },
        { $set: { stripePaymentIntentId: freshIntent.id, status: 'DUE' } }
      );
      return {
        paymentId: (existing as any)._id.toString(),
        clientSecret: freshIntent.client_secret || '',
        stripePaymentIntentId: freshIntent.id,
        tenancyId: scope.tenancyId.toString(),
        unitId: scope.unitId.toString(),
        propertyId: scope.propertyId.toString(),
        orgId: scope.orgId.toString(),
        period,
        amount: existing.amount,
      };
    }
    throw error;
  }

  const stripeCustomerId = await findOrCreateStripeCustomer(input.tenantUserId);

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: asStripeAmount(amount),
      currency: STRIPE_CURRENCY,
      customer: stripeCustomerId,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata: {
        paymentId: payment._id.toString(),
        tenantUserId: input.tenantUserId.toString(),
        tenancyId: scope.tenancyId.toString(),
        unitId: scope.unitId.toString(),
        propertyId: scope.propertyId.toString(),
        orgId: scope.orgId.toString(),
        period,
        type: input.type,
      },
    });

    await PaymentModel.updateOne(
      { _id: payment._id },
      { $set: { stripePaymentIntentId: paymentIntent.id } }
    );

    return {
      paymentId: payment._id.toString(),
      clientSecret: paymentIntent.client_secret || '',
      stripePaymentIntentId: paymentIntent.id,
      tenancyId: scope.tenancyId.toString(),
      unitId: scope.unitId.toString(),
      propertyId: scope.propertyId.toString(),
      orgId: scope.orgId.toString(),
      period,
      amount,
    };
  } catch (error) {
    await PaymentModel.updateOne({ _id: payment._id }, { $set: { status: 'FAILED' } });
    throw error;
  }
}

export function constructStripeEvent(signature: string | undefined, rawBody: Buffer): any {
  if (!signature) {
    throw new AppError('Missing Stripe signature header', 400);
  }
  if (!STRIPE_WEBHOOK_SECRET) {
    throw new AppError('Stripe webhook is not configured (missing STRIPE_WEBHOOK_SECRET)', 500);
  }
  const stripe = getStripeClient();
  return stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
}

export type StripeWebhookProcessingResult = {
  eventType: string;
  duplicate: boolean;
};

/**
 * Idempotent Stripe webhook processing (shared by /api/stripe/webhook and /api/payments/stripe/webhook).
 * Dedupes by Stripe event id; FAILED rows are retried; business logic relies on ledger idempotency keys.
 */
export async function processStripeWebhookEvent(event: any): Promise<StripeWebhookProcessingResult> {
  const paymentIntentId =
    event.type.startsWith('payment_intent.') && (event.data.object as any).id
      ? (event.data.object as any).id
      : undefined;

  let doc = await StripeWebhookEventModel.findOne({ eventId: event.id });
  if (doc?.status === 'PROCESSED') {
    return { eventType: event.type, duplicate: true };
  }

  if (!doc) {
    try {
      doc = await StripeWebhookEventModel.create({
        eventId: event.id,
        eventType: event.type,
        paymentIntentId,
        status: 'PROCESSING',
        attempts: 1,
      });
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
      doc = await StripeWebhookEventModel.findOne({ eventId: event.id });
    }
  }

  if (!doc) {
    throw new AppError('Failed to persist webhook receipt', 500);
  }

  if (doc.status === 'PROCESSED') {
    return { eventType: event.type, duplicate: true };
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const intent = event.data.object as any;
        await markPaymentPaidAndAccrueTokens(intent.id);
        break;
      }
      case 'payment_intent.payment_failed': {
        const intent = event.data.object as any;
        await markPaymentFailed(intent.id);
        break;
      }
      case 'payment_failed': {
        const obj = event.data.object as any;
        const piId =
          typeof obj?.payment_intent === 'string'
            ? obj.payment_intent
            : typeof obj?.payment_intent?.id === 'string'
              ? obj.payment_intent.id
              : typeof obj?.id === 'string'
                ? obj.id
                : undefined;
        if (piId) await markPaymentFailed(piId);
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object as any;
        const refundAmount = (charge.amount_refunded ?? 0) / 100;
        await markPaymentRefunded(charge.payment_intent ?? charge.id, refundAmount);
        break;
      }
      default:
        break;
    }

    await StripeWebhookEventModel.updateOne(
      { _id: doc._id },
      {
        $set: {
          status: 'PROCESSED',
          processedAt: new Date(),
        },
      }
    );

    return { eventType: event.type, duplicate: false };
  } catch (error: any) {
    await StripeWebhookEventModel.updateOne(
      { _id: doc._id },
      {
        $set: {
          status: 'FAILED',
          lastError: error?.message || 'Unknown webhook processing error',
        },
      }
    );
    throw error;
  }
}
