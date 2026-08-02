import mongoose from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { Membership } from '../../orgs/models/membership.model';
import { RewardCatalogModel } from '../../tenant/models/rewardCatalog.model';
import type { CreateLandlordRewardInput, PatchLandlordRewardInput } from '../validation/landlordRewards.validation';

export interface RewardItem {
  id: string;
  rewardId: string;
  title: string;
  description: string;
  costCredits: number;
  category: string;
  status: string;
  orgId: string | null;
  rewardType?: string | null;
  programType: string;
  requiresApproval: boolean;
  redemptionLimit: { type: string; maxCount?: number | null };
}

export async function getLandlordOrgId(userId: mongoose.Types.ObjectId): Promise<string> {
  const membership = await Membership.findOne({
    userId,
    status: 'active',
    roleInOrg: { $in: ['OWNER', 'ADMIN'] },
  })
    .sort({ createdAt: 1 })
    .lean()
    .exec();

  if (!membership) {
    throw new AppError('No organization found for landlord. You must belong to an org as OWNER or ADMIN.', 403);
  }
  return membership.orgId.toString();
}

export async function listLandlordRewards(orgId: string): Promise<RewardItem[]> {
  const oid = new mongoose.Types.ObjectId(orgId);
  const [global, orgRewards] = await Promise.all([
    RewardCatalogModel.find({ orgId: null }).sort({ category: 1, costCredits: 1 }).lean().exec(),
    RewardCatalogModel.find({ orgId: oid }).sort({ category: 1, costCredits: 1 }).lean().exec(),
  ]);

  const byRewardId = new Map<string, RewardItem>();
  for (const d of global as any[]) {
    byRewardId.set(d.rewardId, {
      id: d._id.toString(),
      rewardId: d.rewardId,
      title: d.title,
      description: d.description,
      costCredits: d.costCredits,
      category: d.category,
      status: d.status,
      orgId: null,
      rewardType: d.rewardType ?? null,
      programType: d.programType ?? 'RPA',
      requiresApproval: d.requiresApproval ?? false,
      redemptionLimit: d.redemptionLimit ?? { type: 'UNLIMITED' },
    });
  }
  for (const d of orgRewards as any[]) {
    byRewardId.set(d.rewardId, {
      id: d._id.toString(),
      rewardId: d.rewardId,
      title: d.title,
      description: d.description,
      costCredits: d.costCredits,
      category: d.category,
      status: d.status,
      orgId: d.orgId?.toString() ?? null,
      rewardType: d.rewardType ?? null,
      programType: d.programType ?? 'RPA',
      requiresApproval: d.requiresApproval ?? false,
      redemptionLimit: d.redemptionLimit ?? { type: 'UNLIMITED' },
    });
  }
  return Array.from(byRewardId.values()).sort((a, b) => a.category.localeCompare(b.category) || a.costCredits - b.costCredits);
}

export async function createLandlordReward(orgId: string, input: CreateLandlordRewardInput): Promise<RewardItem> {
  const oid = new mongoose.Types.ObjectId(orgId);
  const existing = await RewardCatalogModel.findOne({ rewardId: input.rewardId, orgId: oid }).lean().exec();
  if (existing) {
    throw new AppError(`Reward with rewardId "${input.rewardId}" already exists for this organization.`, 409);
  }
  const doc = await RewardCatalogModel.create({
    rewardId: input.rewardId,
    title: input.title,
    description: input.description,
    costCredits: input.costCredits,
    category: input.category,
    status: input.status,
    orgId: oid,
    rewardType: (input as any).rewardType ?? null,
    programType: (input as any).programType ?? 'RPA',
    requiresApproval: (input as any).requiresApproval ?? false,
    redemptionLimit: (input as any).redemptionLimit ?? { type: 'UNLIMITED' },
  });
  return {
    id: (doc._id as mongoose.Types.ObjectId).toString(),
    rewardId: doc.rewardId,
    title: doc.title,
    description: doc.description,
    costCredits: doc.costCredits,
    category: doc.category,
    status: doc.status,
    orgId: doc.orgId?.toString() ?? null,
    rewardType: (doc as any).rewardType ?? null,
    programType: (doc as any).programType ?? 'RPA',
    requiresApproval: (doc as any).requiresApproval ?? false,
    redemptionLimit: (doc as any).redemptionLimit ?? { type: 'UNLIMITED' },
  };
}

export async function patchLandlordReward(orgId: string, rewardDocId: string, input: PatchLandlordRewardInput): Promise<RewardItem> {
  const oid = new mongoose.Types.ObjectId(orgId);
  if (!mongoose.Types.ObjectId.isValid(rewardDocId)) {
    throw new AppError('Invalid reward id.', 400);
  }
  const doc = await RewardCatalogModel.findOne({ _id: new mongoose.Types.ObjectId(rewardDocId), orgId: oid }).exec();
  if (!doc) {
    throw new AppError('Reward not found or you do not have permission to update it (only org overrides can be updated).', 404);
  }
  if (input.title != null) doc.title = input.title;
  if (input.description != null) doc.description = input.description;
  if (input.costCredits != null) doc.costCredits = input.costCredits;
  if (input.category != null) doc.category = input.category;
  if (input.status != null) doc.status = input.status;
  if ((input as any).rewardType !== undefined) (doc as any).rewardType = (input as any).rewardType;
  if ((input as any).programType != null) (doc as any).programType = (input as any).programType;
  if ((input as any).requiresApproval !== undefined) (doc as any).requiresApproval = (input as any).requiresApproval;
  if ((input as any).redemptionLimit != null) (doc as any).redemptionLimit = (input as any).redemptionLimit;
  await doc.save();
  return {
    id: (doc._id as mongoose.Types.ObjectId).toString(),
    rewardId: doc.rewardId,
    title: doc.title,
    description: doc.description,
    costCredits: doc.costCredits,
    category: doc.category,
    status: doc.status,
    orgId: doc.orgId?.toString() ?? null,
    rewardType: (doc as any).rewardType ?? null,
    programType: (doc as any).programType ?? 'RPA',
    requiresApproval: (doc as any).requiresApproval ?? false,
    redemptionLimit: (doc as any).redemptionLimit ?? { type: 'UNLIMITED' },
  };
}
