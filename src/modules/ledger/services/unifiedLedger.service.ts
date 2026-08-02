import mongoose from 'mongoose';
import { CreditAccountModel } from '../models/creditAccountModel';
import { CreditEventModel } from '../models/creditEventModel';
import { UnifiedLedgerEntryModel } from '../models/unifiedLedgerEntry.model';
import { CreditEventType } from '../types/creditEventTypes';
import {
  LedgerKind,
  RewardLedgerEventType,
  OwnershipLedgerEventType,
} from '../types/unifiedLedgerTypes';
import { getBalance } from './balanceService';
import { UnitModel } from '../../units/models/unit.model';
export interface UnifiedLedgerContext {
  propertyId?: mongoose.Types.ObjectId;
  businessEventType?: string;
}

/** Maps internal credit type to default business event type for the unified REWARD log. */
export function defaultBusinessEventTypeForCredit(
  type: CreditEventType
): RewardLedgerEventType {
  switch (type) {
    case CreditEventType.CREDIT:
      return RewardLedgerEventType.CREDIT_GENERIC;
    case CreditEventType.DEBIT:
      return RewardLedgerEventType.DEBIT_GENERIC;
    case CreditEventType.ADJUSTMENT:
      return RewardLedgerEventType.ADJUSTMENT;
    case CreditEventType.REDEMPTION:
      return RewardLedgerEventType.REWARD_REDEMPTION;
    case CreditEventType.EXPIRATION:
      return RewardLedgerEventType.EXPIRATION;
    case CreditEventType.TRANSFER_IN:
      return RewardLedgerEventType.TRANSFER_IN;
    case CreditEventType.TRANSFER_OUT:
      return RewardLedgerEventType.TRANSFER_OUT;
    case CreditEventType.REFUND:
      return RewardLedgerEventType.REFUND;
    default:
      return RewardLedgerEventType.CREDIT_GENERIC;
  }
}

/** Signed amount aligned with balanceService / computeBalance rules. */
export function signedAmountForCreditEvent(
  type: CreditEventType,
  amount: number
): number {
  switch (type) {
    case CreditEventType.CREDIT:
    case CreditEventType.TRANSFER_IN:
    case CreditEventType.REFUND:
      return amount;
    case CreditEventType.DEBIT:
    case CreditEventType.TRANSFER_OUT:
    case CreditEventType.REDEMPTION:
    case CreditEventType.EXPIRATION:
      return -amount;
    case CreditEventType.ADJUSTMENT:
      return amount;
    default:
      return amount;
  }
}

async function resolvePropertyId(
  ctx: UnifiedLedgerContext | undefined,
  unitId?: mongoose.Types.ObjectId
): Promise<mongoose.Types.ObjectId | undefined> {
  if (ctx?.propertyId) return ctx.propertyId;
  if (!unitId) return undefined;
  const unit = await UnitModel.findById(unitId).lean();
  return unit?.propertyId as mongoose.Types.ObjectId | undefined;
}

/**
 * Append-only mirror of a credit event into the unified REWARD ledger (BE-204 / BE-210).
 */
export async function syncUnifiedLedgerFromCreditEvent(
  creditEvent: {
    _id: mongoose.Types.ObjectId;
    accountId: mongoose.Types.ObjectId;
    type: CreditEventType;
    amount: number;
    occurredAt: Date;
    description?: string;
  },
  creditIdempotencyKey: string,
  ctx?: UnifiedLedgerContext
): Promise<void> {
  const unifiedKey = `unified:${creditIdempotencyKey}`;
  const existing = await UnifiedLedgerEntryModel.findOne({ idempotencyKey: unifiedKey }).lean();
  if (existing) return;

  const account = await CreditAccountModel.findById(creditEvent.accountId).lean();
  if (!account) return;

  const businessType =
    (ctx?.businessEventType as RewardLedgerEventType | undefined) ??
    defaultBusinessEventTypeForCredit(creditEvent.type);

  const propertyId = await resolvePropertyId(ctx, account.unitId as mongoose.Types.ObjectId | undefined);

  await UnifiedLedgerEntryModel.create({
    ledgerKind: LedgerKind.REWARD,
    eventType: businessType,
    timestamp: creditEvent.occurredAt,
    orgId: account.orgId,
    tenantUserId: account.tenantUserId,
    propertyId,
    unitId: account.unitId,
    signedAmount: signedAmountForCreditEvent(creditEvent.type, creditEvent.amount),
    creditAccountId: creditEvent.accountId,
    creditEventId: creditEvent._id,
    idempotencyKey: unifiedKey,
    metadata: {
      description: creditEvent.description,
      internalCreditType: creditEvent.type,
    },
  });
}

export interface AppendOwnershipEntryInput {
  orgId: mongoose.Types.ObjectId;
  tenantUserId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  unitId?: mongoose.Types.ObjectId;
  eventType: OwnershipLedgerEventType;
  signedAmount: number;
  timestamp?: Date;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

/**
 * Append a TEPA / ownership-token delta to the unified ledger (BE-210).
 */
export async function appendOwnershipLedgerEntry(
  input: AppendOwnershipEntryInput
): Promise<{ isNew: boolean; entryId: string }> {
  const existing = await UnifiedLedgerEntryModel.findOne({
    idempotencyKey: input.idempotencyKey,
  }).lean();
  if (existing) {
    return { isNew: false, entryId: existing._id.toString() };
  }

  const doc = await UnifiedLedgerEntryModel.create({
    ledgerKind: LedgerKind.OWNERSHIP,
    eventType: input.eventType,
    timestamp: input.timestamp ?? new Date(),
    orgId: input.orgId,
    tenantUserId: input.tenantUserId,
    propertyId: input.propertyId,
    unitId: input.unitId,
    signedAmount: input.signedAmount,
    idempotencyKey: input.idempotencyKey,
    metadata: input.metadata,
  });

  return { isNew: true, entryId: doc._id.toString() };
}

export interface ReconciledBalances {
  rewardBalanceFromLedger: number;
  rewardBalanceFromCredits: number;
  rewardMatch: boolean;
  ownershipByProperty: Record<string, number>;
}

/**
 * Reconstruct balances from unified ledger and compare reward total to credit-account balance (BE-210).
 */
export async function reconcileUnifiedBalancesForTenant(
  tenantUserId: mongoose.Types.ObjectId
): Promise<ReconciledBalances> {
  const rewardAgg = await UnifiedLedgerEntryModel.aggregate([
    { $match: { tenantUserId, ledgerKind: LedgerKind.REWARD } },
    { $group: { _id: null, total: { $sum: '$signedAmount' } } },
  ]);
  const rewardBalanceFromLedger = rewardAgg[0]?.total ?? 0;

  const accounts = await CreditAccountModel.find({ tenantUserId }).lean();
  const accountIds = accounts.map((a) => (a as { _id: mongoose.Types.ObjectId })._id);
  let rewardBalanceFromCredits = 0;
  for (const aid of accountIds) {
    rewardBalanceFromCredits += await getBalance(aid);
  }

  const ownAgg = await UnifiedLedgerEntryModel.aggregate([
    { $match: { tenantUserId, ledgerKind: LedgerKind.OWNERSHIP } },
    {
      $group: {
        _id: '$propertyId',
        total: { $sum: '$signedAmount' },
      },
    },
  ]);

  const ownershipByProperty: Record<string, number> = {};
  for (const row of ownAgg) {
    if (row._id) {
      ownershipByProperty[row._id.toString()] = row.total;
    }
  }

  const rewardMatch =
    Math.abs(rewardBalanceFromLedger - rewardBalanceFromCredits) < 0.0001;

  return {
    rewardBalanceFromLedger,
    rewardBalanceFromCredits,
    rewardMatch,
    ownershipByProperty,
  };
}

/** Tenant-scoped list for UI (BE-204 query by tenant). */
export async function listUnifiedEntriesForTenant(
  tenantUserId: mongoose.Types.ObjectId,
  options: {
    ledgerKind?: LedgerKind;
    limit?: number;
    cursor?: string;
  }
): Promise<{
  entries: Array<{
    id: string;
    ledgerKind: LedgerKind;
    eventType: string;
    timestamp: string;
    signedAmount: number;
    propertyId?: string;
    unitId?: string;
    orgId?: string;
    description?: string;
    creditEventId?: string;
  }>;
  nextCursor: string | null;
}> {
  const limit = Math.min(100, Math.max(1, options.limit ?? 25));
  const q: Record<string, unknown> = { tenantUserId };
  if (options.ledgerKind) {
    q.ledgerKind = options.ledgerKind;
  }

  const cursorDoc =
    options.cursor && mongoose.Types.ObjectId.isValid(options.cursor)
      ? await UnifiedLedgerEntryModel.findById(options.cursor).lean()
      : null;

  if (cursorDoc) {
    q.$or = [
      { timestamp: { $lt: cursorDoc.timestamp } },
      {
        timestamp: cursorDoc.timestamp,
        _id: { $lt: cursorDoc._id },
      },
    ];
  }

  const rows = await UnifiedLedgerEntryModel.find(q)
    .sort({ timestamp: -1, _id: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && page.length ? page[page.length - 1]._id.toString() : null;

  return {
    entries: page.map((e) => ({
      id: e._id.toString(),
      ledgerKind: e.ledgerKind as LedgerKind,
      eventType: e.eventType,
      timestamp: e.timestamp.toISOString(),
      signedAmount: e.signedAmount,
      propertyId: e.propertyId?.toString(),
      unitId: e.unitId?.toString(),
      orgId: e.orgId?.toString(),
      description: (e.metadata as { description?: string } | undefined)?.description,
      creditEventId: e.creditEventId?.toString(),
    })),
    nextCursor,
  };
}
