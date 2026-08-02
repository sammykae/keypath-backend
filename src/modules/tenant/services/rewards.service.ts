import mongoose from 'mongoose';
import { RewardCatalogModel } from '../models/rewardCatalog.model';

export interface TenantRewardItem {
  rewardId: string;
  title: string;
  description: string;
  costCredits: number;
  category: string;
  status: string;
  actionLabel: string;
}

export async function getRewards(tenantOrgId?: string | null): Promise<TenantRewardItem[]> {
  const globalQuery = { $or: [{ orgId: null }, { orgId: { $exists: false } }] };
  const global = await RewardCatalogModel.find(globalQuery).sort({ category: 1, costCredits: 1 }).lean().exec();

  const byRewardId = new Map<string, TenantRewardItem>();
  for (const d of global as any[]) {
    byRewardId.set(d.rewardId, {
      rewardId: d.rewardId,
      title: d.title,
      description: d.description,
      costCredits: d.costCredits,
      category: d.category,
      status: d.status,
      actionLabel: d.actionLabel ?? 'Redeem',
    });
  }

  if (tenantOrgId && mongoose.Types.ObjectId.isValid(tenantOrgId)) {
    const oid = new mongoose.Types.ObjectId(tenantOrgId);
    const orgRewards = await RewardCatalogModel.find({ orgId: oid }).sort({ category: 1, costCredits: 1 }).lean().exec();
    for (const d of orgRewards as any[]) {
      byRewardId.set(d.rewardId, {
        rewardId: d.rewardId,
        title: d.title,
        description: d.description,
        costCredits: d.costCredits,
        category: d.category,
        status: d.status,
        actionLabel: d.actionLabel ?? 'Redeem',
      });
    }
  }

  return Array.from(byRewardId.values()).sort((a, b) => a.category.localeCompare(b.category) || a.costCredits - b.costCredits);
}
