import mongoose from 'mongoose';
import { CreditAccountModel } from '../models/creditAccountModel';
import { CreditEventModel } from '../models/creditEventModel';
import { CreditEventType } from '../types/creditEventTypes';
import { getBalance } from './balanceService';
import { OwnershipCreditsQuery } from '../dto/ledgerDTO';
import { UnifiedLedgerEntryModel } from '../models/unifiedLedgerEntry.model';

/** API-facing event type (BE-101) */
const API_EVENT_TYPE: Record<string, string> = {
  [CreditEventType.CREDIT]: 'EARN',
  [CreditEventType.REDEMPTION]: 'REDEEM',
  [CreditEventType.ADJUSTMENT]: 'ADJUST',
  [CreditEventType.EXPIRATION]: 'EXPIRE',
  [CreditEventType.DEBIT]: 'DEBIT',
  [CreditEventType.TRANSFER_IN]: 'TRANSFER_IN',
  [CreditEventType.TRANSFER_OUT]: 'TRANSFER_OUT',
  [CreditEventType.REFUND]: 'REFUND',
};

function toApiType(internalType: string): string {
  return API_EVENT_TYPE[internalType] ?? internalType;
}

/** Map API filter type to internal CreditEventType(s) */
function apiTypeToInternal(apiType: string): string[] {
  const map: Record<string, string[]> = {
    EARN: [CreditEventType.CREDIT],
    REDEEM: [CreditEventType.REDEMPTION],
    ADJUST: [CreditEventType.ADJUSTMENT],
    EXPIRE: [CreditEventType.EXPIRATION],
  };
  return map[apiType] ?? [];
}

export interface OwnershipCreditsResult {
  balance: number;
  events: Array<{
    id: string;
    type: string;
    amount: number;
    occurredAt: string;
    /** BE-204 / BE-210: immutable ledger fields when using unified REWARD log */
    ledgerKind?: 'REWARD';
    eventType?: string;
    timestamp?: string;
    propertyId?: string;
    unitId?: string;
    description?: string;
    referenceId?: string;
  }>;
  nextCursor: string | null;
}

/**
 * Get ownership credits for the authenticated tenant: balance and paginated events.
 * Aggregates across all credit accounts for this tenant.
 */
export async function getOwnershipCredits(
  tenantUserId: mongoose.Types.ObjectId,
  query: OwnershipCreditsQuery
): Promise<OwnershipCreditsResult> {
  const limit = query.limit ?? 25;
  const typesFilter = query.type ? apiTypeToInternal(query.type) : [];

  const accounts = await CreditAccountModel.find({
    tenantUserId,
  })
    .lean();

  const accountIds = accounts.map((a) => (a as any)._id);
  if (accountIds.length === 0) {
    return { balance: 0, events: [], nextCursor: null };
  }

  // Parallelize balance fetches to avoid N+1 sequential calls (BE-203 style hardening)
  const balances = await Promise.all(accountIds.map((aid) => getBalance(aid)));
  const balance = balances.reduce((sum, b) => sum + b, 0);

  const q: any = { accountId: { $in: accountIds } };
  if (typesFilter.length) {
    q.type = { $in: typesFilter };
  }

  const cursorDoc = query.cursor && mongoose.Types.ObjectId.isValid(query.cursor)
    ? await CreditEventModel.findById(query.cursor).lean()
    : null;
  if (cursorDoc) {
    q.$or = [
      { occurredAt: { $lt: cursorDoc.occurredAt } },
      { occurredAt: cursorDoc.occurredAt, _id: { $lt: cursorDoc._id } },
    ];
  }

  const events = await CreditEventModel.find(q)
    .sort({ occurredAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = events.length > limit;
  const page = hasMore ? events.slice(0, limit) : events;
  const nextCursor = hasMore && page.length
    ? page[page.length - 1]._id.toString()
    : null;

  const creditEventIds = page.map((e) => e._id);
  const unifiedRows = await UnifiedLedgerEntryModel.find({
    tenantUserId,
    creditEventId: { $in: creditEventIds },
  })
    .lean();
  const unifiedByCreditId = new Map(
    unifiedRows.map((u) => [u.creditEventId!.toString(), u])
  );

  const eventList = page.map((e) => {
    const u = unifiedByCreditId.get(e._id.toString());
    const base = {
      id: e._id.toString(),
      type: toApiType(e.type),
      amount: e.amount,
      occurredAt: e.occurredAt.toISOString(),
      description: e.description,
      referenceId: e.referenceId?.toString(),
    };
    if (!u) {
      return base;
    }
    return {
      ...base,
      ledgerKind: 'REWARD' as const,
      eventType: u.eventType,
      timestamp: u.timestamp.toISOString(),
      propertyId: u.propertyId?.toString(),
      unitId: u.unitId?.toString(),
    };
  });

  return {
    balance,
    events: eventList,
    nextCursor,
  };
}
