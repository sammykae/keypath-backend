import { TokenLedgerModel } from '../../tokens/models/tokenLedgerModel';
import mongoose from 'mongoose';

export interface ReconciliationReport {
  propertyId?: string;
  orgId?: string;
  mongoTotal: number;
  onChainTotal: number;
  difference: number;
  status: 'MATCH' | 'MISMATCH';
  lastChecked: Date;
}

/**
 * Reconcile on-chain token supply with MongoDB aggregates
 * 
 * This compares the sum of all token deltas in MongoDB with the on-chain
 * token supply. Currently returns stub on-chain total (0) since mirroring
 * is not yet enabled.
 * 
 * @param propertyId - Optional property ID to reconcile for specific property
 * @param orgId - Optional organization ID to reconcile for specific org
 * @returns Reconciliation report JSON
 */
export const reconcileOnChainSupply = async (
  propertyId?: string,
  orgId?: string
): Promise<ReconciliationReport> => {
  // Build query for MongoDB aggregation
  const query: any = {};
  
  if (propertyId) {
    query.propertyId = new mongoose.Types.ObjectId(propertyId);
  }
  
  if (orgId) {
    query.orgId = new mongoose.Types.ObjectId(orgId);
  }

  // Aggregate token deltas from MongoDB
  const mongoAggregate = await TokenLedgerModel.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        total: { $sum: '$delta' }
      }
    }
  ]);

  const mongoTotal = mongoAggregate.length > 0 ? mongoAggregate[0].total : 0;

  // TODO: Query on-chain token supply
  // When mirroring is enabled, this will:
  // 1. Connect to blockchain RPC
  // 2. Call token contract's totalSupply() function
  // 3. Return the actual on-chain total
  const onChainTotal = 0; // Stub: returns 0 until mirroring is enabled

  const difference = mongoTotal - onChainTotal;
  const status: 'MATCH' | 'MISMATCH' = difference === 0 ? 'MATCH' : 'MISMATCH';

  return {
    propertyId: propertyId,
    orgId: orgId,
    mongoTotal,
    onChainTotal,
    difference,
    status,
    lastChecked: new Date()
  };
};

