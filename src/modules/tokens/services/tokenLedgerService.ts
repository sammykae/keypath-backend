import { TokenLedgerModel } from '../models/tokenLedgerModel';
import mongoose from 'mongoose';

export interface TokenDelta {
  propertyId: string;
  unitId?: string;
  amount: number;
  reason: 'RENT_ACCRUAL' | 'BONUS' | 'CORRECTION' | 'REDEMPTION';
  ts: Date;
}

export interface ListDeltasOptions {
  since?: Date;
  orgId?: string;
  propertyId?: string;
}

/**
 * List token deltas from the token ledger since a given timestamp
 * 
 * Overload: listDeltas(since) - matches checklist signature
 * @param since - Date to filter deltas from (inclusive)
 * @returns Array of token deltas formatted for mirroring: [{ propertyId, unitId?, amount, reason, ts }]
 */
export function listDeltas(since: Date): Promise<TokenDelta[]>;

/**
 * List token deltas from the token ledger with optional filters
 * @param options - Filter options including since date, orgId, and propertyId
 * @returns Array of token deltas formatted for mirroring
 */
export function listDeltas(options?: ListDeltasOptions): Promise<TokenDelta[]>;

export async function listDeltas(sinceOrOptions?: Date | ListDeltasOptions): Promise<TokenDelta[]> {
  // Handle overload: if first param is Date, convert to options
  const options: ListDeltasOptions = sinceOrOptions instanceof Date 
    ? { since: sinceOrOptions }
    : (sinceOrOptions || {});
  const { since, orgId, propertyId } = options;

  // Build query
  const query: any = {};
  
  if (since) {
    query.ts = { $gte: since };
  }
  
  if (orgId) {
    query.orgId = new mongoose.Types.ObjectId(orgId);
  }
  
  if (propertyId) {
    query.propertyId = new mongoose.Types.ObjectId(propertyId);
  }

  // Query token ledger
  const ledgerEntries = await TokenLedgerModel.find(query)
    .sort({ ts: 1 }) // Sort by timestamp ascending
    .lean();

  // Transform to delta format
  const deltas: TokenDelta[] = ledgerEntries.map(entry => ({
    propertyId: entry.propertyId.toString(),
    unitId: entry.unitId?.toString(),
    amount: entry.delta,
    reason: entry.reason,
    ts: entry.ts
  }));

  return deltas;
};

