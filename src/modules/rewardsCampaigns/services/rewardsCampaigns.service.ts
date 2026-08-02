import mongoose from "mongoose";
import { AppError } from "../../../core/errors/AppError";
import { PropertyModel } from "../../properties/models/propertyModel";
import { TenantInviteModel } from "../../invites/models/tenantInvite.model";
import { RewardsCampaignModel } from "../models/rewardsCampaign.model";
import type { CreateRewardsCampaignDTO } from "../dto/rewardsCampaignDTO";

async function assertPropertyInOrg(requesterOrgId: string, propertyId: string): Promise<void> {
  const property = await PropertyModel.findOne({
    _id: new mongoose.Types.ObjectId(propertyId),
    orgId: new mongoose.Types.ObjectId(requesterOrgId),
  })
    .select("_id")
    .lean();

  if (!property) throw new AppError("Forbidden: property not in your org", 403);
}

async function isRpaEnabledForProperty(propertyId: string): Promise<boolean> {
  // Property participation model is derived from accepted TenantInvites.
  // - RPA_ONLY => requiredAgreements contains "RPA"
  // - BOTH => requiredAgreements contains "RPA_AND_TEPA"
  const exists = await TenantInviteModel.exists({
    propertyId: new mongoose.Types.ObjectId(propertyId),
    status: "ACCEPTED",
    requiredAgreements: { $in: ["RPA", "RPA_AND_TEPA"] },
  });

  return Boolean(exists);
}

export async function createRewardsCampaign(
  requesterOrgId: string,
  dto: CreateRewardsCampaignDTO
) {
  await assertPropertyInOrg(requesterOrgId, dto.propertyId);

  const rpaEnabled = await isRpaEnabledForProperty(dto.propertyId);
  if (!rpaEnabled) {
    throw new AppError("Campaigns only allowed if RPA is enabled", 400);
  }

  const created = await RewardsCampaignModel.create({
    propertyId: new mongoose.Types.ObjectId(dto.propertyId),
    goal: dto.goal,
    budget: dto.budget,
    eligibleBehaviors: dto.eligibleBehaviors,
    rewardType: dto.rewardType ?? "POINTS",
    startDate: dto.startDate,
    endDate: dto.endDate,
  });

  return created.toObject();
}

export async function listRewardsCampaigns(
  requesterOrgId: string,
  opts: { propertyId?: string; limit?: number }
) {
  const limit = opts.limit ?? 50;
  const q: any = {};

  if (opts.propertyId) {
    await assertPropertyInOrg(requesterOrgId, opts.propertyId);
    q.propertyId = new mongoose.Types.ObjectId(opts.propertyId);
  } else {
    const properties = await PropertyModel.find({ orgId: new mongoose.Types.ObjectId(requesterOrgId) })
      .select("_id")
      .lean();
    const propertyIds = properties.map((p) => (p as any)._id as mongoose.Types.ObjectId);
    q.propertyId = { $in: propertyIds };
  }

  const campaigns = await RewardsCampaignModel.find(q)
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(200, limit)))
    .lean();

  return campaigns;
}

