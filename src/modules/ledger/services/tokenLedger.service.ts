import mongoose from "mongoose";
import { AppError } from "../../../core/errors/AppError";
import { PropertyModel } from "../../properties/models/propertyModel";
import { TenancyModel } from "../../tenancies/models/tenancyModel";
import { PaymentModel } from "../../payments/models/payment.model";
import { CreateTokenLedgerEntryDTO } from "../dto/ledgerDTO";
import { TokenLedgerEntryModel, TokenLedgerEntryType } from "../models/tokenLedgerEntry.model";
import { isEligibleForEarnings } from "../../good-standing/services/goodStanding.service";
import { writeAuditEvent } from "../../audit/services/audit.service";

export type TokenLedgerActor = {
  userId?: mongoose.Types.ObjectId | string;
  role?: string;
};

/** Maps a token ledger entry type to the ticket's required distinct audit action names. */
function auditActionForTokenEntryType(type: TokenLedgerEntryType): string {
  switch (type) {
    case TokenLedgerEntryType.ACCRUAL:
    case TokenLedgerEntryType.PURCHASE:
    case TokenLedgerEntryType.SPOT_PURCHASE:
    case TokenLedgerEntryType.INCENTIVE_TOKEN:
      return "TOKEN_ISSUED";
    case TokenLedgerEntryType.VESTING:
    case TokenLedgerEntryType.VESTED_TOKEN_PAYMENT_RIGHT:
      return "TOKEN_VESTED";
    case TokenLedgerEntryType.CORRECTION:
    case TokenLedgerEntryType.ADJUSTMENT:
      return "TOKEN_CORRECTED";
    case TokenLedgerEntryType.FORFEIT:
      return "TOKEN_FORFEITED";
    default:
      return "TOKEN_LEDGER_ENTRY_CREATED";
  }
}

type LedgerListFilters = {
  tenantId?: string;
  propertyId?: string;
};

const UNVESTED_SOURCE_MARKER = "UNVESTED";

async function assertObjectId(id: string, label: string): Promise<mongoose.Types.ObjectId> {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(`Invalid ${label}`, 400);
  }
  return new mongoose.Types.ObjectId(id);
}

async function isTenantInGoodStanding(tenantId: mongoose.Types.ObjectId, propertyId: mongoose.Types.ObjectId) {
  const tenancy = await TenancyModel.findOne({
    tenantUserId: tenantId,
    status: "ACTIVE",
  })
    .select("_id unitId status")
    .lean();

  if (!tenancy) {
    return { ok: false, reason: "No active tenancy found" };
  }

  // Good Standing engine: PAUSED/SUSPENDED standing blocks token accrual
  const eligibility = await isEligibleForEarnings(tenantId);
  if (!eligibility.ok) {
    return { ok: false, reason: eligibility.reason ?? `Good Standing is ${eligibility.status}` };
  }

  const hasUnhealthyPayment = await PaymentModel.exists({
    tenantUserId: tenantId,
    propertyId,
    status: { $in: ["LATE", "FAILED"] },
  });

  if (hasUnhealthyPayment) {
    return { ok: false, reason: "Tenant payment standing is not healthy" };
  }

  return { ok: true, reason: null as string | null };
}

async function isTenantEvicted(tenantId: mongoose.Types.ObjectId) {
  const tenancy = await TenancyModel.findOne({ tenantUserId: tenantId })
    .sort({ updatedAt: -1 })
    .select("status")
    .lean();
  if (!tenancy) return false;
  return tenancy.status === "TERMINATED" || tenancy.status === "ENDED";
}

function normalizeSource(source: string) {
  return source.trim().toUpperCase();
}

async function getUnvestedTokenPool(tenantId: mongoose.Types.ObjectId, propertyId: mongoose.Types.ObjectId) {
  const rows = await TokenLedgerEntryModel.aggregate<{ total: number }>([
    {
      $match: {
        tenantId,
        propertyId,
        source: { $regex: UNVESTED_SOURCE_MARKER, $options: "i" },
      },
    },
    { $group: { _id: null, total: { $sum: "$tokens" } } },
  ]);
  return rows[0]?.total ?? 0;
}

export async function createTokenLedgerEntry(data: CreateTokenLedgerEntryDTO, actor?: TokenLedgerActor) {
  const propertyId = await assertObjectId(data.property_id, "property_id");
  const tenantId = await assertObjectId(data.tenant_id, "tenant_id");

  const property = await PropertyModel.findById(propertyId).select("_id status").lean();
  if (!property) {
    throw new AppError("Property not found", 404);
  }

  const source = normalizeSource(data.source);
  const isEvicted = await isTenantEvicted(tenantId);
  if (isEvicted && data.type === TokenLedgerEntryType.ACCRUAL) {
    throw new AppError("Tokens are frozen due to eviction; accrual entries are blocked", 403);
  }

  if (data.type === TokenLedgerEntryType.ACCRUAL) {
    const standing = await isTenantInGoodStanding(tenantId, propertyId);
    if (!standing.ok) {
      throw new AppError(`Accrual blocked: ${standing.reason}`, 403);
    }
  }

  if (data.type === TokenLedgerEntryType.FORFEIT && !source.includes("VIOLATION")) {
    throw new AppError("Forfeit entries must include a violation source", 400);
  }
  if (data.type === TokenLedgerEntryType.FORFEIT && data.tokens >= 0) {
    throw new AppError("Forfeit entries must use negative token values", 400);
  }

  const timestamp = data.timestamp || new Date();
  const currentBalance = await getTokenBalance({
    tenantId: tenantId.toString(),
    propertyId: propertyId.toString(),
  });
  const nextBalance = currentBalance + data.tokens;
  if (nextBalance < 0) {
    throw new AppError("Negative token balance is not allowed", 400);
  }

  if (data.type === TokenLedgerEntryType.FORFEIT) {
    const unvestedPool = await getUnvestedTokenPool(tenantId, propertyId);
    const requestedForfeit = Math.abs(data.tokens);
    if (requestedForfeit > unvestedPool) {
      throw new AppError(
        `Forfeit exceeds unvested token pool (${requestedForfeit} > ${unvestedPool})`,
        400
      );
    }
  }

  try {
    const entry = await TokenLedgerEntryModel.create({
      propertyId,
      tenantId,
      type: data.type,
      tokens: data.tokens,
      value: data.value,
      timestamp,
      source: data.source,
    });

    const balance = await getTokenBalance({ tenantId: tenantId.toString(), propertyId: propertyId.toString() });

    const actorUserId = actor?.userId
      ? new mongoose.Types.ObjectId(actor.userId)
      : undefined;
    await writeAuditEvent({
      actorUserId,
      userRole: actor?.role,
      action: auditActionForTokenEntryType(data.type),
      entityType: "TOKEN_LEDGER_ENTRY",
      entityId: entry._id,
      propertyId,
      tenantId,
      source: actorUserId ? "user" : "system",
      updateType: actorUserId ? "manual" : "system_generated",
      metadata: { type: data.type, source: data.source, tokens: data.tokens, value: data.value },
      diff: { before: { balance: currentBalance }, after: { balance } },
    });

    return { entry, balance };
  } catch (err: any) {
    if (err?.code === 11000) {
      throw new AppError("Duplicate ledger entry detected", 409);
    }
    throw err;
  }
}

export async function getTokenBalance(filters: LedgerListFilters) {
  const match: Record<string, any> = {};
  if (filters.tenantId) {
    match.tenantId = await assertObjectId(filters.tenantId, "tenant_id");
  }
  if (filters.propertyId) {
    match.propertyId = await assertObjectId(filters.propertyId, "property_id");
  }

  const row = await TokenLedgerEntryModel.aggregate<{ totalTokens: number }>([
    { $match: match },
    { $group: { _id: null, totalTokens: { $sum: "$tokens" } } },
  ]);

  return row[0]?.totalTokens ?? 0;
}

export async function listTokenLedgerEntries(filters: LedgerListFilters) {
  const query: Record<string, any> = {};
  if (filters.tenantId) {
    query.tenantId = await assertObjectId(filters.tenantId, "tenant_id");
  }
  if (filters.propertyId) {
    query.propertyId = await assertObjectId(filters.propertyId, "property_id");
  }

  const entries = await TokenLedgerEntryModel.find(query).sort({ timestamp: -1, createdAt: -1 }).lean();
  const balance = await getTokenBalance(filters);

  return { entries, balance };
}

type StripeLedgerInput = {
  propertyId: string;
  tenantId: string;
  period: string;
  paidAt?: Date;
  amount: number;
  incentivesEarnedCredits?: number;
};

type StripeLedgerIdempotentInput = StripeLedgerInput & {
  tokenAmount?: number;
  stripePaymentIntentId: string;
};

/**
 * Stripe payment bridge:
 * creates an append-only purchase entry when rent is paid via Stripe.
 */
export async function createLedgerEntryFromStripePayment(input: StripeLedgerInput) {
  const credits = input.incentivesEarnedCredits ?? Math.floor(input.amount / 1000);
  if (credits <= 0) {
    return null;
  }

  return createTokenLedgerEntry({
    property_id: input.propertyId,
    tenant_id: input.tenantId,
    type: TokenLedgerEntryType.PURCHASE,
    tokens: credits,
    value: input.amount,
    timestamp: input.paidAt || new Date(),
    source: `STRIPE_PAYMENT:${input.period}`,
  });
}

/**
 * Idempotent version: skips if a ledger entry for this stripePaymentIntentId already exists.
 */
export async function createLedgerEntryFromStripePaymentIdempotent(input: StripeLedgerIdempotentInput) {
  const source = `STRIPE_PAYMENT:${input.period}:${input.stripePaymentIntentId}`;

  const propertyOid = await assertObjectId(input.propertyId, "propertyId");
  const tenantOid = await assertObjectId(input.tenantId, "tenantId");

  const existing = await TokenLedgerEntryModel.findOne({ source, propertyId: propertyOid, tenantId: tenantOid }).lean();
  if (existing) {
    return { entry: existing, balance: await getTokenBalance({ tenantId: input.tenantId, propertyId: input.propertyId }) };
  }

  const credits = input.tokenAmount ?? input.incentivesEarnedCredits ?? Math.floor(input.amount / 1000);
  if (credits <= 0) {
    return null;
  }

  return createTokenLedgerEntry({
    property_id: input.propertyId,
    tenant_id: input.tenantId,
    type: TokenLedgerEntryType.PURCHASE,
    tokens: credits,
    value: input.amount,
    timestamp: input.paidAt || new Date(),
    source,
  });
}
