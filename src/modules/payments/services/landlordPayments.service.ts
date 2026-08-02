import mongoose from 'mongoose';
import { PaymentModel } from '../models/payment.model';
import { UnitModel } from '../../units/models/unit.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { resolveLandlordOrgId } from '../../landlord/services/landlordDashboard.service';
import { AppError } from '../../../core/errors/AppError';
import { writeAuditEvent } from '../../audit/services/audit.service';
import type { PaymentStatus } from '../models/payment.model';
import type {
  CreatePaymentBody,
  UpdatePaymentBody,
  LandlordPaymentsQuery,
} from '../dto/landlordPayment.dto';
import { createLedgerEntryFromStripePayment } from '../../ledger/services/tokenLedger.service';

/** Parse range like "12m" into months (default 12) */
function parseRangeMonths(range: string): number {
  const match = range.match(/^(\d+)m$/i);
  if (match) return Math.min(24, Math.max(1, parseInt(match[1], 10)));
  return 12;
}

export interface LandlordPaymentItem {
  id: string;
  tenantUserId: string;
  unitId: string;
  propertyId: string;
  period: string;
  amount: number;
  status: PaymentStatus;
  dueDate: string;
  paidAt?: string;
  method?: string;
  incentivesEarnedCredits?: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Valid status transitions: from -> [to] */
const VALID_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  DUE: ['PAID', 'LATE', 'FAILED'],
  LATE: ['PAID', 'FAILED', 'DUE'],
  FAILED: ['DUE', 'PAID'],
  PAID: [], // terminal
  REFUNDED: [], // terminal — set only by Stripe webhook
};

function validateStatusTransition(from: PaymentStatus, to: PaymentStatus): void {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed?.includes(to)) {
    throw new AppError(
      `Invalid status transition: ${from} -> ${to}`,
      400
    );
  }
}

function toLandlordPaymentItem(p: Record<string, unknown>): LandlordPaymentItem {
  const item: LandlordPaymentItem = {
    id: (p._id as mongoose.Types.ObjectId).toString(),
    tenantUserId: (p.tenantUserId as mongoose.Types.ObjectId).toString(),
    unitId: (p.unitId as mongoose.Types.ObjectId).toString(),
    propertyId: (p.propertyId as mongoose.Types.ObjectId).toString(),
    period: p.period as string,
    amount: p.amount as number,
    status: p.status as PaymentStatus,
    dueDate: (p.dueDate as Date).toISOString(),
    createdAt: (p.createdAt as Date).toISOString(),
    updatedAt: (p.updatedAt as Date).toISOString(),
  };
  if (p.paidAt) item.paidAt = (p.paidAt as Date).toISOString();
  if (p.method) item.method = p.method as string;
  if (p.incentivesEarnedCredits != null) item.incentivesEarnedCredits = p.incentivesEarnedCredits as number;
  if (p.metadata) item.metadata = p.metadata as Record<string, unknown>;
  return item;
}

function parsePeriodToDueDate(period: string): Date {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month - 1, 5);
}

function isStripeMethod(method?: string | null): boolean {
  if (!method) return false;
  return method.toLowerCase().includes('stripe');
}

/**
 * Ensure unit belongs to property and property belongs to landlord org.
 */
async function ensureOrgScope(
  unitId: mongoose.Types.ObjectId,
  propertyId: mongoose.Types.ObjectId,
  orgId: string
): Promise<void> {
  const unit = await UnitModel.findById(unitId).lean();
  if (!unit || unit.propertyId.toString() !== propertyId.toString()) {
    throw new AppError('Unit not found or does not belong to property', 404);
  }
  const property = await PropertyModel.findById(propertyId).lean();
  if (!property || (property as any).orgId.toString() !== orgId) {
    throw new AppError('Property not found or does not belong to your org', 403);
  }
}

/**
 * List payments for landlord's org. Supports filters: propertyId, unitId, tenantUserId, status, range.
 */
export async function listLandlordPayments(
  userId: mongoose.Types.ObjectId,
  query: LandlordPaymentsQuery,
  authOrgId?: string | null
): Promise<{ payments: LandlordPaymentItem[] }> {
  const orgId = await resolveLandlordOrgId(userId, authOrgId);
  const orgOid = new mongoose.Types.ObjectId(orgId);

  const months = parseRangeMonths(query.range ?? '12m');
  const start = new Date();
  start.setMonth(start.getMonth() - months);
  start.setHours(0, 0, 0, 0);

  const filter: Record<string, unknown> = {
    orgId: orgOid,
    dueDate: { $gte: start },
  };
  if (query.propertyId) filter.propertyId = new mongoose.Types.ObjectId(query.propertyId);
  if (query.unitId) filter.unitId = new mongoose.Types.ObjectId(query.unitId);
  if (query.tenantUserId) filter.tenantUserId = new mongoose.Types.ObjectId(query.tenantUserId);
  if (query.status) filter.status = query.status;

  const list = await PaymentModel.find(filter)
    .sort({ dueDate: -1 })
    .lean();

  const payments = list.map((p) => toLandlordPaymentItem(p as Record<string, unknown>));
  return { payments };
}

export async function createLandlordPayment(
  userId: mongoose.Types.ObjectId,
  body: CreatePaymentBody,
  authOrgId?: string | null
): Promise<LandlordPaymentItem> {
  const orgId = await resolveLandlordOrgId(userId, authOrgId);
  const unitOid = new mongoose.Types.ObjectId(body.unitId);
  const propertyOid = new mongoose.Types.ObjectId(body.propertyId);

  await ensureOrgScope(unitOid, propertyOid, orgId);

  const tenantOid = new mongoose.Types.ObjectId(body.tenantUserId);
  const dueDate = body.dueDate
    ? new Date(body.dueDate)
    : parsePeriodToDueDate(body.period);
  const paidAt = body.paidAt ? new Date(body.paidAt) : undefined;
  const orgOid = new mongoose.Types.ObjectId(orgId);

  const existing = await PaymentModel.findOne({
    tenantUserId: tenantOid,
    period: body.period,
  }).lean();
  if (existing) {
    throw new AppError(
      `Payment already exists for tenant in period ${body.period}`,
      409
    );
  }

  const doc = await PaymentModel.create({
    tenantUserId: tenantOid,
    unitId: unitOid,
    propertyId: propertyOid,
    orgId: orgOid,
    period: body.period,
    amount: body.amount,
    status: body.status,
    dueDate,
    paidAt: body.status === 'PAID' ? paidAt ?? new Date() : paidAt,
    method: body.method ?? undefined,
    metadata: body.metadata ?? undefined,
  });

  await writeAuditEvent({
    actorUserId: userId,
    orgId: orgOid,
    action: 'LANDLORD_PAYMENT_CREATED',
    entityType: 'LEDGER',
    entityId: doc._id,
    propertyId: propertyOid,
    tenantId: tenantOid,
    metadata: { period: body.period, amount: body.amount, status: body.status },
    diff: { before: null, after: { period: body.period, status: body.status } },
  });

  if (doc.status === 'PAID' && isStripeMethod(doc.method)) {
    await createLedgerEntryFromStripePayment({
      propertyId: doc.propertyId.toString(),
      tenantId: doc.tenantUserId.toString(),
      period: doc.period,
      paidAt: doc.paidAt ?? new Date(),
      amount: doc.amount,
      incentivesEarnedCredits: doc.incentivesEarnedCredits,
    });
  }

  return toLandlordPaymentItem(doc.toObject() as unknown as Record<string, unknown>);
}

export async function updateLandlordPayment(
  userId: mongoose.Types.ObjectId,
  paymentId: string,
  body: UpdatePaymentBody,
  authOrgId?: string | null
): Promise<LandlordPaymentItem> {
  const orgId = await resolveLandlordOrgId(userId, authOrgId);
  const paymentOid = new mongoose.Types.ObjectId(paymentId);

  const payment = await PaymentModel.findById(paymentOid).lean();
  if (!payment) {
    throw new AppError('Payment not found', 404);
  }
  if ((payment as any).orgId.toString() !== orgId) {
    throw new AppError('Payment does not belong to your org', 403);
  }

  const currentStatus = payment.status as PaymentStatus;
  if (body.status && body.status !== currentStatus) {
    validateStatusTransition(currentStatus, body.status);
  }

  const becomesPaid = body.status === 'PAID' && currentStatus !== 'PAID';

  const updates: Record<string, unknown> = {};
  if (body.amount !== undefined) updates.amount = body.amount;
  if (body.status !== undefined) {
    updates.status = body.status;
    if (body.status === 'PAID') {
      updates.paidAt = body.paidAt ? new Date(body.paidAt) : new Date();
    } else if (body.paidAt !== undefined) {
      updates.paidAt = body.paidAt ? new Date(body.paidAt) : null;
    }
  } else if (body.paidAt !== undefined) {
    updates.paidAt = body.paidAt ? new Date(body.paidAt) : null;
  }
  if (body.method !== undefined) updates.method = body.method;
  if (body.metadata !== undefined) updates.metadata = body.metadata;

  await PaymentModel.updateOne({ _id: paymentOid }, { $set: updates });

  const updated = await PaymentModel.findById(paymentOid).lean();
  if (!updated) throw new AppError('Payment not found', 404);

  const becamePaid = payment.status !== 'PAID' && updated.status === 'PAID';
  if (becamePaid && isStripeMethod((updated.method as string | undefined) ?? undefined)) {
    await createLedgerEntryFromStripePayment({
      propertyId: (updated.propertyId as mongoose.Types.ObjectId).toString(),
      tenantId: (updated.tenantUserId as mongoose.Types.ObjectId).toString(),
      period: updated.period,
      paidAt: (updated.paidAt as Date | undefined) ?? new Date(),
      amount: updated.amount,
      incentivesEarnedCredits: updated.incentivesEarnedCredits,
    });
  }

  const p = updated as unknown as {
    _id: mongoose.Types.ObjectId;
    orgId: mongoose.Types.ObjectId;
    propertyId: mongoose.Types.ObjectId;
    tenantUserId: mongoose.Types.ObjectId;
  };
  await writeAuditEvent({
    actorUserId: userId,
    orgId: p.orgId,
    action: 'LANDLORD_PAYMENT_UPDATED',
    entityType: 'LEDGER',
    entityId: p._id,
    propertyId: p.propertyId,
    tenantId: p.tenantUserId,
    metadata: { keys: Object.keys(updates) },
    diff: { after: updates },
  });
  return toLandlordPaymentItem(updated as unknown as Record<string, unknown>);
}

/**
 * Delete payment. Org-scoped. Only if payment belongs to landlord's org.
 */
export async function deleteLandlordPayment(
  userId: mongoose.Types.ObjectId,
  paymentId: string,
  authOrgId?: string | null
): Promise<void> {
  const orgId = await resolveLandlordOrgId(userId, authOrgId);
  const paymentOid = new mongoose.Types.ObjectId(paymentId);

  const payment = await PaymentModel.findById(paymentOid).lean();
  if (!payment) {
    throw new AppError('Payment not found', 404);
  }
  if ((payment as any).orgId.toString() !== orgId) {
    throw new AppError('Payment does not belong to your org', 403);
  }

  const p = payment as unknown as {
    _id: mongoose.Types.ObjectId;
    orgId: mongoose.Types.ObjectId;
    propertyId: mongoose.Types.ObjectId;
    tenantUserId: mongoose.Types.ObjectId;
    period?: string;
    status?: string;
  };
  await writeAuditEvent({
    actorUserId: userId,
    orgId: p.orgId,
    action: 'LANDLORD_PAYMENT_DELETED',
    entityType: 'LEDGER',
    entityId: p._id,
    propertyId: p.propertyId,
    tenantId: p.tenantUserId,
    diff: { before: { period: p.period, status: p.status }, after: null },
  });

  await PaymentModel.deleteOne({ _id: paymentOid });
}
