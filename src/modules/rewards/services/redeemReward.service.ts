import mongoose from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { RewardCatalogModel } from '../../tenant/models/rewardCatalog.model';
import { RedemptionModel } from '../models/redemption.model';
import { CreditAccountModel } from '../../ledger/models/creditAccountModel';
import { getBalance } from '../../ledger/services/balanceService';
import { createCreditEventWithIdempotency } from '../../ledger/services/idempotencyService';
import { CreditEventType } from '../../ledger/types/creditEventTypes';
import { fulfillRedemption, FulfillmentResult } from './fulfillment.service';
import { isEligibleForEarnings } from '../../good-standing/services/goodStanding.service';

export interface RedeemRewardInput {
  tenantUserId: mongoose.Types.ObjectId;
  rewardId: string;
  idempotencyKey: string;
}

export interface RedeemRewardReceipt {
  redemptionId: string;
  remainingBalance: number;
  approvalStatus: string;
  fulfillment?: FulfillmentResult;
  message?: string;
}

/**
 * Redeem a reward: deduct credits, write REDEEM event and redemption record.
 * Idempotent: same key returns same receipt; key reused with different payload → 409.
 * Prevents overdraft (400 if insufficient balance).
 *
 * If the reward requires approval (requiresApproval=true):
 *   - Redemption is created with approvalStatus=PENDING
 *   - No fulfillment happens until landlord approves via PATCH /api/landlord/rewards/redemptions/:id/approve
 *
 * If requiresApproval=false (default): immediate fulfillment as before.
 */
export async function redeemReward(
  input: RedeemRewardInput
): Promise<RedeemRewardReceipt> {
  const { tenantUserId, rewardId, idempotencyKey } = input;

  // ── 0. Good Standing gate: PAUSED/SUSPENDED tenants cannot redeem ─────────
  const eligibility = await isEligibleForEarnings(tenantUserId);
  if (!eligibility.ok) {
    throw new AppError(
      `Reward redemption is paused — Good Standing is ${eligibility.status}${eligibility.reason ? ` (${eligibility.reason})` : ''}`,
      403
    );
  }

  // ── 1. Look up reward in catalog (slug first, then _id fallback) ──────────
  let catalog: any = await RewardCatalogModel.findOne({ rewardId }).lean();
  if (!catalog && mongoose.Types.ObjectId.isValid(rewardId)) {
    catalog = await RewardCatalogModel.findById(rewardId).lean();
  }
  if (!catalog) {
    throw new AppError('Reward not found', 404);
  }
  if (catalog.status !== 'active' && catalog.status !== 'ACTIVE') {
    throw new AppError('Reward is not available', 400);
  }
  const amount = catalog.costCredits;
  const catalogOid: mongoose.Types.ObjectId = catalog._id;

  // ── 2. Check per-tenant redemption limits ─────────────────────────────────
  const limit = catalog.redemptionLimit ?? { type: 'UNLIMITED' };
  if (limit.type === 'ONE_TIME') {
    const prior = await RedemptionModel.findOne({ rewardId: catalogOid, tenantUserId }).lean();
    if (prior) throw new AppError('This reward can only be redeemed once', 400);
  } else if (limit.type === 'LIMITED' && limit.maxCount) {
    const count = await RedemptionModel.countDocuments({ rewardId: catalogOid, tenantUserId });
    if (count >= limit.maxCount) {
      throw new AppError(`Redemption limit of ${limit.maxCount} reached for this reward`, 400);
    }
  }

  // ── 3. Idempotency: if key already used return existing receipt ───────────
  const existingRedemption = await RedemptionModel.findOne({ idempotencyKey }).lean();
  if (existingRedemption) {
    if (
      existingRedemption.rewardId.toString() !== catalogOid.toString() ||
      existingRedemption.amount !== amount
    ) {
      throw new AppError('Idempotency key reused with different payload', 409);
    }
    const remainingBalance = await getBalance(existingRedemption.accountId);
    const f = (existingRedemption as any).fulfillment;
    return {
      redemptionId: (existingRedemption as any)._id.toString(),
      remainingBalance,
      approvalStatus: (existingRedemption as any).approvalStatus ?? 'NOT_REQUIRED',
      fulfillment: f ?? undefined,
    };
  }

  // ── 4. Sum all credit accounts to check total balance ─────────────────────
  const accounts = await CreditAccountModel.find({ tenantUserId }).lean();
  if (accounts.length === 0) {
    throw new AppError('No credit account found for tenant', 400);
  }

  const accountBalances = await Promise.all(
    (accounts as any[]).map(async (acc) => ({
      _id: acc._id as mongoose.Types.ObjectId,
      balance: await getBalance(acc._id),
    }))
  );
  const totalBalance = accountBalances.reduce((sum, a) => sum + a.balance, 0);
  if (totalBalance < amount) {
    throw new AppError('Insufficient balance to redeem this reward', 400);
  }

  // Deduct from the account with the largest balance
  accountBalances.sort((a, b) => b.balance - a.balance);
  const accountId = accountBalances[0]._id;

  // ── 5. Write redemption record ────────────────────────────────────────────
  const requiresApproval = catalog.requiresApproval === true;
  const approvalStatus = requiresApproval ? 'PENDING' : 'NOT_REQUIRED';

  const redemption = await RedemptionModel.create({
    rewardId: catalogOid,
    accountId,
    tenantUserId,
    amount,
    idempotencyKey,
    approvalStatus,
  });

  // ── 6. Write REDEMPTION credit event (rollback redemption doc on failure) ─
  try {
    await createCreditEventWithIdempotency(
      {
        accountId,
        type: CreditEventType.REDEMPTION,
        amount,
        occurredAt: new Date(),
        description: `Redeem reward: ${catalog.title}`,
        referenceId: redemption._id,
      },
      idempotencyKey
    );
  } catch (err: any) {
    await RedemptionModel.findByIdAndDelete(redemption._id);
    throw err;
  }

  // ── 7. Re-compute balance ─────────────────────────────────────────────────
  const remainingBalance = await getBalance(accountId);

  // ── 8. Fulfill immediately if no approval needed ──────────────────────────
  if (!requiresApproval) {
    const fulfillment = await fulfillRedemption(
      redemption._id,
      { category: catalog.category, rewardId: catalog.rewardId, deliveryAmount: catalog.deliveryAmount },
      tenantUserId
    );
    return {
      redemptionId: redemption._id.toString(),
      remainingBalance,
      approvalStatus,
      fulfillment,
    };
  }

  return {
    redemptionId: redemption._id.toString(),
    remainingBalance,
    approvalStatus,
    message: 'Your redemption request has been submitted and is pending landlord approval.',
  };
}
