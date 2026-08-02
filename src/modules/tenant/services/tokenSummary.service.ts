import mongoose from 'mongoose';
import { CreditAccountModel } from '../../ledger/models/creditAccountModel';
import { CreditEventModel } from '../../ledger/models/creditEventModel';
import { CreditEventType } from '../../ledger/types/creditEventTypes';
import { getBalance } from '../../ledger/services/balanceService';

export interface TokenSummary {
  total: number;
  redeemed: number;
  available: number;
  expiringSoon: number;
}

export interface TokenActivityItem {
  date: string;
  description: string;
  type: 'Earned' | 'Spent';
  tokens: number;
  status: 'Pending' | 'Approved';
}

const EARNING_TYPES = [CreditEventType.CREDIT, CreditEventType.REFUND, CreditEventType.TRANSFER_IN];
const SPENDING_TYPES = [CreditEventType.DEBIT, CreditEventType.REDEMPTION, CreditEventType.EXPIRATION, CreditEventType.TRANSFER_OUT];

export async function getTokenSummary(tenantUserId: mongoose.Types.ObjectId): Promise<TokenSummary> {
  const accounts = await CreditAccountModel.find({ tenantUserId }).lean();
  const accountIds = accounts.map((a: any) => a._id);

  if (accountIds.length === 0) {
    return { total: 0, redeemed: 0, available: 0, expiringSoon: 0 };
  }

  const [balances, earnAgg, redeemAgg] = await Promise.all([
    Promise.all(accountIds.map((aid: mongoose.Types.ObjectId) => getBalance(aid))),
    CreditEventModel.aggregate([
      { $match: { accountId: { $in: accountIds }, type: { $in: EARNING_TYPES } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    CreditEventModel.aggregate([
      { $match: { accountId: { $in: accountIds }, type: CreditEventType.REDEMPTION } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);

  const available = balances.reduce((sum: number, b: number) => sum + b, 0);
  const total = earnAgg[0]?.total ?? 0;
  const redeemed = redeemAgg[0]?.total ?? 0;

  return { total, redeemed, available, expiringSoon: 0 };
}

export async function getTokenActivity(
  tenantUserId: mongoose.Types.ObjectId,
  limit: number = 10
): Promise<{ items: TokenActivityItem[] }> {
  const accounts = await CreditAccountModel.find({ tenantUserId }).lean();
  const accountIds = accounts.map((a: any) => a._id);

  if (accountIds.length === 0) return { items: [] };

  const events = await CreditEventModel.find({ accountId: { $in: accountIds } })
    .sort({ occurredAt: -1, _id: -1 })
    .limit(limit)
    .lean();

  const pendingThresholdMs = 24 * 60 * 60 * 1000;
  const now = Date.now();

  const items: TokenActivityItem[] = events.map((e: any) => {
    const isEarning = EARNING_TYPES.includes(e.type as CreditEventType);
    const isPending = now - new Date(e.occurredAt).getTime() < pendingThresholdMs;

    return {
      date: new Date(e.occurredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      description: e.description ?? (isEarning ? 'Token earned' : 'Token spent'),
      type: isEarning ? 'Earned' : 'Spent',
      tokens: e.amount,
      status: isPending ? 'Pending' : 'Approved',
    };
  });

  return { items };
}
