import mongoose from 'mongoose';
import { CreditEventModel } from '../../ledger/models/creditEventModel';
import { CreditEventType } from '../../ledger/types/creditEventTypes';

export interface CampaignLedgerMetrics {
  participantCount: number;
  tokensIssued: number;
}

/**
 * Aggregates CREDIT ledger rows tied to campaigns (referenceId = campaign _id).
 */
export async function getCampaignMetricsMap(
  campaignIds: mongoose.Types.ObjectId[]
): Promise<Map<string, CampaignLedgerMetrics>> {
  const map = new Map<string, CampaignLedgerMetrics>();
  if (campaignIds.length === 0) return map;

  const rows = await CreditEventModel.aggregate<{
    _id: mongoose.Types.ObjectId;
    tokensIssued: number;
    accounts: mongoose.Types.ObjectId[];
  }>([
    {
      $match: {
        type: CreditEventType.CREDIT,
        referenceId: { $in: campaignIds },
      },
    },
    {
      $group: {
        _id: '$referenceId',
        tokensIssued: { $sum: '$amount' },
        accounts: { $addToSet: '$accountId' },
      },
    },
  ]);

  for (const r of rows) {
    const id = r._id.toString();
    map.set(id, {
      tokensIssued: r.tokensIssued,
      participantCount: Array.isArray(r.accounts) ? r.accounts.length : 0,
    });
  }

  return map;
}
