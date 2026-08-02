import mongoose from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { RewardCatalogModel } from '../../tenant/models/rewardCatalog.model';
import { RedemptionModel } from '../../rewards/models/redemption.model';
import { TenantChallengeModel } from '../../tenant/models/tenantChallenge.model';
import { fulfillRedemption } from '../../rewards/services/fulfillment.service';
import { issueCreditsToTenant } from '../../ledger/services/issueCredits.service';
import { writeAuditEvent } from '../../audit/services/audit.service';
import { AuditEvent } from '../../audit/models/audit-log.model';
import {
  listLandlordRewards,
  createLandlordReward,
} from '../../landlord-rewards/services/landlordRewards.service';
import type { CreateLandlordRewardInput } from '../../landlord-rewards/validation/landlordRewards.validation';
import {
  createRewardsCampaign,
  listRewardsCampaigns,
} from '../../rewardsCampaigns/services/rewardsCampaigns.service';
import { createChallenge, type CreateChallengeInput } from '../../tenant/services/challenges.service';
import { PropertyManagerAssignmentModel, PMPermission } from '../models/propertyManagerAssignment.model';
import {
  listVerifications,
  markTenantEligible,
  reviewVerification,
  resolveDispute,
} from '../../rewardVerifications/services/rewardVerification.service';
import { RewardVerificationModel } from '../../rewardVerifications/models/rewardVerification.model';
import type {
  MarkEligibleInput,
  ReviewVerificationInput,
  ResolveDisputeInput,
} from '../../rewardVerifications/dto/rewardVerification.dto';

/**
 * RPA administration for a Property Manager (Ticket: Phase 5). All of these
 * reuse the same underlying services/models the landlord-facing endpoints
 * use — nothing here is a parallel reward/campaign/redemption system, only
 * the org/property resolution differs (assignment + permission, never
 * Membership/OWNER-ADMIN like the landlord path).
 */

async function getActiveAssignments(propertyManagerUserId: mongoose.Types.ObjectId, orgId: string) {
  if (!mongoose.Types.ObjectId.isValid(orgId)) throw new AppError('Invalid orgId', 400);
  const rows = await PropertyManagerAssignmentModel.find({
    propertyManagerUserId,
    orgId: new mongoose.Types.ObjectId(orgId),
    status: 'ACTIVE',
  }).lean();
  if (rows.length === 0) throw new AppError('No active assignment in this organization', 403);
  return rows as any[];
}

function propertiesWithPermission(assignments: any[], permission: PMPermission): mongoose.Types.ObjectId[] {
  return assignments.filter((a) => a.permissions.includes(permission)).map((a) => a.propertyId);
}

/** Assignment for one specific property, requiring `permission`. Throws 403 if missing either. */
async function getAssignmentForProperty(
  propertyManagerUserId: mongoose.Types.ObjectId,
  propertyId: string,
  permission: PMPermission
) {
  if (!mongoose.Types.ObjectId.isValid(propertyId)) throw new AppError('Invalid propertyId', 400);
  const assignment = await PropertyManagerAssignmentModel.findOne({
    propertyManagerUserId,
    propertyId: new mongoose.Types.ObjectId(propertyId),
    status: 'ACTIVE',
  }).lean();
  if (!assignment) throw new AppError('You are not assigned to this property', 403);
  if (!(assignment as any).permissions.includes(permission)) {
    throw new AppError(`Missing ${permission} permission on this property`, 403);
  }
  return assignment as any;
}

// ── Reward catalog ──────────────────────────────────────────────────────────

/** Reward catalog entries are org-wide (not property-scoped) — requires RPA_VIEW on at least one property in the org. */
export async function listRewardCatalogForPM(propertyManagerUserId: mongoose.Types.ObjectId, orgId: string) {
  const assignments = await getActiveAssignments(propertyManagerUserId, orgId);
  if (propertiesWithPermission(assignments, 'RPA_VIEW').length === 0) {
    throw new AppError('Missing RPA_VIEW permission', 403);
  }
  return listLandlordRewards(orgId);
}

export async function createRewardCatalogEntryForPM(
  propertyManagerUserId: mongoose.Types.ObjectId,
  orgId: string,
  input: CreateLandlordRewardInput
) {
  const assignments = await getActiveAssignments(propertyManagerUserId, orgId);
  if (propertiesWithPermission(assignments, 'RPA_CREATE_REWARD').length === 0) {
    throw new AppError('Missing RPA_CREATE_REWARD permission', 403);
  }
  const reward = await createLandlordReward(orgId, input);
  AuditEvent.create({
    actorUserId: propertyManagerUserId,
    orgId: new mongoose.Types.ObjectId(orgId),
    action: 'PM_REWARD_CREATED',
    entityType: 'RewardCatalog',
    entityId: new mongoose.Types.ObjectId(reward.id),
    source: 'user',
    updateType: 'manual',
  }).catch(() => {});
  return reward;
}

// ── Campaigns ────────────────────────────────────────────────────────────────

export async function listCampaignsForPM(
  propertyManagerUserId: mongoose.Types.ObjectId,
  orgId: string,
  propertyId?: string
) {
  const assignments = await getActiveAssignments(propertyManagerUserId, orgId);
  const viewableProps = propertiesWithPermission(assignments, 'RPA_VIEW');
  if (viewableProps.length === 0) return { campaigns: [] };

  if (propertyId) {
    if (!viewableProps.some((id) => id.toString() === propertyId)) {
      throw new AppError('Missing RPA_VIEW permission on this property', 403);
    }
    return { campaigns: await listRewardsCampaigns(orgId, { propertyId }) };
  }

  const all = await listRewardsCampaigns(orgId, {});
  const allowedSet = new Set(viewableProps.map((id) => id.toString()));
  return { campaigns: (all as any[]).filter((c) => allowedSet.has(c.propertyId?.toString())) };
}

export async function createCampaignForPM(
  propertyManagerUserId: mongoose.Types.ObjectId,
  propertyId: string,
  input: { goal: string; budget: number; eligibleBehaviors: string[]; rewardType?: string; startDate?: Date; endDate?: Date }
) {
  const assignment = await getAssignmentForProperty(propertyManagerUserId, propertyId, 'RPA_CREATE_CAMPAIGN');
  const campaign = await createRewardsCampaign(assignment.orgId.toString(), { ...input, propertyId } as any);
  AuditEvent.create({
    actorUserId: propertyManagerUserId,
    orgId: assignment.orgId,
    action: 'PM_CAMPAIGN_CREATED',
    entityType: 'RewardsCampaign',
    entityId: (campaign as any)._id ?? (campaign as any).id,
    source: 'user',
    updateType: 'manual',
    propertyId: assignment.propertyId,
  }).catch(() => {});
  return campaign;
}

// ── Challenges ───────────────────────────────────────────────────────────────

export async function listChallengesForPM(
  propertyManagerUserId: mongoose.Types.ObjectId,
  orgId: string,
  propertyId?: string
) {
  const assignments = await getActiveAssignments(propertyManagerUserId, orgId);
  const viewableProps = propertiesWithPermission(assignments, 'RPA_VIEW');
  if (viewableProps.length === 0) return { challenges: [] };

  if (propertyId && !viewableProps.some((id) => id.toString() === propertyId)) {
    throw new AppError('Missing RPA_VIEW permission on this property', 403);
  }

  const filter: any = { orgId: new mongoose.Types.ObjectId(orgId) };
  filter.propertyId = propertyId
    ? new mongoose.Types.ObjectId(propertyId)
    : { $in: viewableProps };
  const challenges = await TenantChallengeModel.find(filter).sort({ createdAt: -1 }).lean();
  return { challenges };
}

export async function createChallengeForPM(
  propertyManagerUserId: mongoose.Types.ObjectId,
  propertyId: string,
  input: Omit<CreateChallengeInput, 'creatorType' | 'createdBy' | 'orgId' | 'propertyId'>
) {
  const assignment = await getAssignmentForProperty(propertyManagerUserId, propertyId, 'RPA_CREATE_CHALLENGE');
  const challenge = await createChallenge({
    ...input,
    creatorType: 'PROPERTY_MANAGER',
    createdBy: propertyManagerUserId,
    orgId: assignment.orgId,
    propertyId: assignment.propertyId,
  } as CreateChallengeInput);
  AuditEvent.create({
    actorUserId: propertyManagerUserId,
    orgId: assignment.orgId,
    action: 'PM_CHALLENGE_CREATED',
    entityType: 'TenantChallenge',
    entityId: challenge._id,
    source: 'user',
    updateType: 'manual',
    propertyId: assignment.propertyId,
  }).catch(() => {});
  return challenge;
}

// ── Redemption approvals ──────────────────────────────────────────────────────

async function tenantIdsForProperties(propertyIds: mongoose.Types.ObjectId[]): Promise<mongoose.Types.ObjectId[]> {
  if (propertyIds.length === 0) return [];
  const units = await UnitModel.find({ propertyId: { $in: propertyIds } }, '_id').lean();
  const unitIds = units.map((u: any) => u._id);
  const tenancies = await TenancyModel.find({ unitId: { $in: unitIds }, status: 'ACTIVE' }, 'tenantUserId').lean();
  return tenancies.map((t: any) => t.tenantUserId);
}

export async function listPendingRedemptionsForPM(propertyManagerUserId: mongoose.Types.ObjectId, orgId: string) {
  const assignments = await getActiveAssignments(propertyManagerUserId, orgId);
  const viewableProps = propertiesWithPermission(assignments, 'RPA_VIEW');
  const tenantIds = await tenantIdsForProperties(viewableProps);
  if (tenantIds.length === 0) return { items: [] };

  const redemptions = await RedemptionModel.find({ tenantUserId: { $in: tenantIds }, approvalStatus: 'PENDING' })
    .populate('rewardId', 'title category costCredits rewardType')
    .populate('tenantUserId', 'email profile.firstName profile.lastName')
    .sort({ createdAt: -1 })
    .lean();

  return {
    items: (redemptions as any[]).map((r) => ({
      redemptionId: r._id.toString(),
      tenant: r.tenantUserId
        ? { id: r.tenantUserId._id?.toString(), email: r.tenantUserId.email }
        : null,
      reward: r.rewardId
        ? { id: r.rewardId._id?.toString(), title: r.rewardId.title, category: r.rewardId.category, costCredits: r.rewardId.costCredits }
        : null,
      amount: r.amount,
      approvalStatus: r.approvalStatus,
      createdAt: r.createdAt?.toISOString(),
    })),
  };
}

export async function reviewRedemptionForPM(
  propertyManagerUserId: mongoose.Types.ObjectId,
  orgId: string,
  redemptionId: string,
  input: { action: 'APPROVE' | 'REJECT'; rejectionReason?: string }
) {
  if (!mongoose.Types.ObjectId.isValid(redemptionId)) throw new AppError('Invalid redemption id', 400);
  const assignments = await getActiveAssignments(propertyManagerUserId, orgId);
  const approveProps = propertiesWithPermission(assignments, 'RPA_APPROVE_REDEMPTION');
  if (approveProps.length === 0) throw new AppError('Missing RPA_APPROVE_REDEMPTION permission', 403);
  const tenantIds = await tenantIdsForProperties(approveProps);

  const redemption = await RedemptionModel.findById(redemptionId);
  if (!redemption) throw new AppError('Redemption not found', 404);
  if (redemption.approvalStatus !== 'PENDING') {
    throw new AppError(`Cannot review redemption in status: ${redemption.approvalStatus}`, 400);
  }
  const tenantInScope = tenantIds.some((id) => id.toString() === redemption.tenantUserId.toString());
  if (!tenantInScope) throw new AppError('Tenant is not on a property you manage', 403);

  const orgOid = new mongoose.Types.ObjectId(orgId);

  if (input.action === 'REJECT') {
    redemption.approvalStatus = 'REJECTED';
    redemption.rejectedBy = propertyManagerUserId;
    redemption.rejectionReason = input.rejectionReason ?? null;
    await redemption.save();
    await writeAuditEvent({
      actorUserId: propertyManagerUserId,
      orgId: orgOid,
      action: 'PM_REDEMPTION_REJECTED',
      entityType: 'REDEMPTION',
      entityId: redemption._id as mongoose.Types.ObjectId,
      tenantId: redemption.tenantUserId as mongoose.Types.ObjectId,
      metadata: { rejectionReason: input.rejectionReason },
    });
    return { redemptionId: redemption._id.toString(), approvalStatus: 'REJECTED' as const };
  }

  redemption.approvalStatus = 'APPROVED';
  redemption.approvedBy = propertyManagerUserId;
  redemption.approvedAt = new Date();
  await redemption.save();

  const catalog: any = await RewardCatalogModel.findById(redemption.rewardId).lean();
  if (catalog) {
    await fulfillRedemption(
      redemption._id as mongoose.Types.ObjectId,
      { category: catalog.category, rewardId: catalog.rewardId, deliveryAmount: catalog.deliveryAmount },
      redemption.tenantUserId as mongoose.Types.ObjectId
    );
  }

  await writeAuditEvent({
    actorUserId: propertyManagerUserId,
    orgId: orgOid,
    action: 'PM_REDEMPTION_APPROVED',
    entityType: 'REDEMPTION',
    entityId: redemption._id as mongoose.Types.ObjectId,
    tenantId: redemption.tenantUserId as mongoose.Types.ObjectId,
  });

  const updated: any = await RedemptionModel.findById(redemption._id).lean();
  return {
    redemptionId: updated?._id?.toString(),
    approvalStatus: updated?.approvalStatus,
    fulfillment: updated?.fulfillment ?? null,
  };
}

// ── Balance adjustment ────────────────────────────────────────────────────────

export async function adjustTenantBalanceForPM(
  propertyManagerUserId: mongoose.Types.ObjectId,
  propertyId: string,
  tenantUserId: string,
  input: { amount: number; reason: string }
) {
  const assignment = await getAssignmentForProperty(propertyManagerUserId, propertyId, 'RPA_ADJUST_BALANCE');
  if (!mongoose.Types.ObjectId.isValid(tenantUserId)) throw new AppError('Invalid tenantUserId', 400);

  const orgId = assignment.orgId.toString();

  // Confirm the tenant has an active tenancy on a unit within this property.
  const units = await UnitModel.find({ propertyId: assignment.propertyId }, '_id').lean();
  const unitIds = units.map((u: any) => u._id);
  const tenancy = await TenancyModel.findOne({
    tenantUserId: new mongoose.Types.ObjectId(tenantUserId),
    unitId: { $in: unitIds },
    status: 'ACTIVE',
  }).lean();
  if (!tenancy) throw new AppError('Tenant is not on a unit you manage on this property', 403);

  const idempotencyKey = `pm-adjust-${propertyManagerUserId}-${tenantUserId}-${Date.now()}`;
  const result = await issueCreditsToTenant(
    {
      tenantUserId,
      amount: input.amount,
      reason: input.reason,
      type: 'ADJUST',
      idempotencyKey,
      orgId,
      propertyId,
    } as any,
    orgId,
    propertyManagerUserId
  );

  await writeAuditEvent({
    actorUserId: propertyManagerUserId,
    orgId: assignment.orgId,
    action: 'PM_BALANCE_ADJUSTED',
    entityType: 'CreditAccount',
    entityId: new mongoose.Types.ObjectId(result.accountId),
    tenantId: new mongoose.Types.ObjectId(tenantUserId),
    metadata: { amount: input.amount, reason: input.reason },
  });

  return result;
}

// ── Reward verifications (submit/review/dispute workflow) ───────────────────

/** List verifications on properties this PM can view (RPA_VIEW). */
export async function listVerificationsForPM(
  propertyManagerUserId: mongoose.Types.ObjectId,
  orgId: string,
  propertyId?: string
) {
  const assignments = await getActiveAssignments(propertyManagerUserId, orgId);
  const viewableProps = propertiesWithPermission(assignments, 'RPA_VIEW');
  if (viewableProps.length === 0) return { verifications: [] };

  if (propertyId) {
    if (!viewableProps.some((id) => id.toString() === propertyId)) {
      throw new AppError('Missing RPA_VIEW permission on this property', 403);
    }
    return { verifications: await listVerifications(orgId, { propertyId }) };
  }

  const all = await listVerifications(orgId, {});
  const allowedSet = new Set(viewableProps.map((id) => id.toString()));
  return { verifications: all.filter((v) => allowedSet.has(v.propertyId)) };
}

/** Mark a tenant eligible for a reward on a property this PM administers (RPA_CREATE_CAMPAIGN). */
export async function markTenantEligibleForPM(
  propertyManagerUserId: mongoose.Types.ObjectId,
  propertyId: string,
  input: Omit<MarkEligibleInput, 'propertyId'>
) {
  const assignment = await getAssignmentForProperty(propertyManagerUserId, propertyId, 'RPA_CREATE_CAMPAIGN');
  return markTenantEligible(propertyManagerUserId, assignment.orgId.toString(), { ...input, propertyId } as any);
}

async function assertVerificationInPMScope(
  propertyManagerUserId: mongoose.Types.ObjectId,
  orgId: string,
  verificationId: string,
  permission: PMPermission
): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(verificationId)) throw new AppError('Invalid verification id', 400);
  const assignments = await getActiveAssignments(propertyManagerUserId, orgId);
  const approveProps = propertiesWithPermission(assignments, permission);
  if (approveProps.length === 0) throw new AppError(`Missing ${permission} permission`, 403);

  const verification = await RewardVerificationModel.findOne(
    { _id: new mongoose.Types.ObjectId(verificationId), orgId: new mongoose.Types.ObjectId(orgId) },
    'propertyId'
  ).lean();
  if (!verification) throw new AppError('Reward verification not found', 404);
  if (!approveProps.some((id) => id.toString() === (verification as any).propertyId.toString())) {
    throw new AppError(`Missing ${permission} permission on this property`, 403);
  }
}

/** Approve/deny a reward verification on a property this PM administers (RPA_APPROVE_REDEMPTION). */
export async function reviewVerificationForPM(
  propertyManagerUserId: mongoose.Types.ObjectId,
  orgId: string,
  verificationId: string,
  input: ReviewVerificationInput
) {
  await assertVerificationInPMScope(propertyManagerUserId, orgId, verificationId, 'RPA_APPROVE_REDEMPTION');
  return reviewVerification(propertyManagerUserId, orgId, verificationId, input);
}

/** Resolve a disputed reward verification on a property this PM administers (RPA_APPROVE_REDEMPTION). */
export async function resolveDisputeForPM(
  propertyManagerUserId: mongoose.Types.ObjectId,
  orgId: string,
  verificationId: string,
  input: ResolveDisputeInput
) {
  await assertVerificationInPMScope(propertyManagerUserId, orgId, verificationId, 'RPA_APPROVE_REDEMPTION');
  return resolveDispute(propertyManagerUserId, orgId, verificationId, input);
}
