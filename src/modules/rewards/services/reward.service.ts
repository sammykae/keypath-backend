import mongoose from "mongoose";
import { RewardModel } from "../models/reward.model";
import { AppError } from "../../../core/errors/AppError";

export interface CreateRewardInput {
  name: string;
  creditCost: number;
  orgId?: string | null;
}

export interface RewardItem {
  _id: string;
  name: string;
  creditCost: number;
  orgId?: string | null;
  createdAt: string;
}

/**
 * Create a new reward. Landlord creates for their org; admin can create global (orgId null).
 */
export async function createReward(input: CreateRewardInput): Promise<RewardItem> {
  const { name, creditCost, orgId } = input;

  const doc: { name: string; creditCost: number; orgId?: mongoose.Types.ObjectId } = {
    name,
    creditCost,
  };
  if (orgId && mongoose.Types.ObjectId.isValid(orgId)) {
    doc.orgId = new mongoose.Types.ObjectId(orgId);
  }

  const reward = await RewardModel.create(doc);
  return {
    _id: reward._id.toString(),
    name: reward.name,
    creditCost: reward.creditCost,
    orgId: reward.orgId?.toString() ?? null,
    createdAt: reward.createdAt.toISOString(),
  };
}

/**
 * List rewards.
 * - Tenant: no orgId → returns all (global + any org).
 * - Landlord: orgId → returns their org's rewards + global (orgId null).
 */
export async function listRewards(options?: {
  orgId?: string | null;
  limit?: number;
  cursor?: string;
}): Promise<{ rewards: RewardItem[]; nextCursor?: string }> {
  const limit = Math.min(100, Math.max(1, options?.limit ?? 50));
  const query: Record<string, unknown> = {};

  if (options?.orgId && mongoose.Types.ObjectId.isValid(options.orgId)) {
    const oid = new mongoose.Types.ObjectId(options.orgId);
    query.$or = [{ orgId: oid }, { orgId: null }];
  }

  const cursor = options?.cursor && mongoose.Types.ObjectId.isValid(options.cursor)
    ? { _id: { $gt: new mongoose.Types.ObjectId(options.cursor) } }
    : {};
  const fullQuery = { ...query, ...cursor };

  const docs = await RewardModel.find(fullQuery)
    .sort({ _id: 1 })
    .limit(limit + 1)
    .lean();

  const hasMore = docs.length > limit;
  const items = (hasMore ? docs.slice(0, limit) : docs) as Array<{
    _id: mongoose.Types.ObjectId;
    name: string;
    creditCost: number;
    orgId?: mongoose.Types.ObjectId | null;
    createdAt: Date;
  }>;

  const rewards: RewardItem[] = items.map((r) => ({
    _id: r._id.toString(),
    name: r.name,
    creditCost: r.creditCost,
    orgId: r.orgId?.toString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  const nextCursor = hasMore && items.length > 0
    ? items[items.length - 1]._id.toString()
    : undefined;

  return { rewards, nextCursor };
}
