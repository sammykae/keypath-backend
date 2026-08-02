import mongoose from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { PropertyModel } from '../../properties/models/propertyModel';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { UnitModel } from '../../units/models/unit.model';
import { AuditEvent } from '../../audit/models/audit-log.model';
import { Membership } from '../../orgs/models/membership.model';
import { issueCreditsToTenant } from '../../ledger/services/issueCredits.service';
import { notify } from '../../notifications/services/notification.service';
import {
  RewardVerificationModel,
  IRewardVerification,
} from '../models/rewardVerification.model';
import {
  MarkEligibleInput,
  SubmitVerificationInput,
  ReviewVerificationInput,
  DisputeVerificationInput,
  ResolveDisputeInput,
  ListVerificationsQuery,
} from '../dto/rewardVerification.dto';

export interface RewardVerificationDTO {
  id: string;
  propertyId: string;
  unitId: string | null;
  tenantUserId: string;
  campaignId: string | null;
  eligibleBehavior: string;
  rewardType: string;
  status: string;
  proofNote: string | null;
  attachments: { fileKey: string; fileName: string; fileType: string }[];
  creditsRequested: number | null;
  creditsAwarded: number;
  denialReason: string | null;
  disputeReason: string | null;
  resolutionOutcome: string | null;
  resolutionNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  disputedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function toDTO(v: IRewardVerification): RewardVerificationDTO {
  return {
    id: v._id.toString(),
    propertyId: v.propertyId.toString(),
    unitId: v.unitId?.toString() ?? null,
    tenantUserId: v.tenantUserId.toString(),
    campaignId: v.campaignId?.toString() ?? null,
    eligibleBehavior: v.eligibleBehavior,
    rewardType: v.rewardType,
    status: v.status,
    proofNote: v.proofNote ?? null,
    attachments: (v.attachments ?? []).map((a) => ({ fileKey: a.fileKey, fileName: a.fileName, fileType: a.fileType })),
    creditsRequested: v.creditsRequested ?? null,
    creditsAwarded: v.creditsAwarded ?? 0,
    denialReason: v.denialReason ?? null,
    disputeReason: v.disputeReason ?? null,
    resolutionOutcome: v.resolutionOutcome ?? null,
    resolutionNote: v.resolutionNote ?? null,
    submittedAt: v.submittedAt ? v.submittedAt.toISOString() : null,
    reviewedAt: v.reviewedAt ? v.reviewedAt.toISOString() : null,
    disputedAt: v.disputedAt ? v.disputedAt.toISOString() : null,
    resolvedAt: v.resolvedAt ? v.resolvedAt.toISOString() : null,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  };
}

async function assertPropertyInOrg(propertyId: string, orgId: string): Promise<void> {
  const exists = await PropertyModel.exists({
    _id: new mongoose.Types.ObjectId(propertyId),
    orgId: new mongoose.Types.ObjectId(orgId),
  });
  if (!exists) throw new AppError('Property not found in your organization', 403);
}

async function assertTenantHasTenancyAtProperty(
  tenantUserId: mongoose.Types.ObjectId,
  propertyId: string,
  unitId?: string
): Promise<mongoose.Types.ObjectId> {
  const tenancies = await TenancyModel.find({ tenantUserId, status: 'ACTIVE' }).lean();
  if (tenancies.length === 0) throw new AppError('You do not have an active tenancy', 403);

  const unitIds = tenancies.map((t: any) => t.unitId);
  const units = await UnitModel.find({ _id: { $in: unitIds } }, 'propertyId').lean();
  const unitByProperty = new Map(units.map((u: any) => [u._id.toString(), u.propertyId.toString()]));

  for (const t of tenancies as any[]) {
    if (unitId && t.unitId.toString() !== unitId) continue;
    if (unitByProperty.get(t.unitId.toString()) === propertyId) {
      return t.unitId as mongoose.Types.ObjectId;
    }
  }
  throw new AppError('You do not have an active tenancy at this property', 403);
}

async function findOwned(id: string, orgId: string): Promise<mongoose.Document & IRewardVerification> {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError('Invalid verification id', 400);
  const doc = await RewardVerificationModel.findOne({
    _id: new mongoose.Types.ObjectId(id),
    orgId: new mongoose.Types.ObjectId(orgId),
  });
  if (!doc) throw new AppError('Reward verification not found', 404);
  return doc as any;
}

/** Landlord/PM proactively flags a tenant as eligible for a behavior, before proof is submitted. */
export async function markTenantEligible(
  actorUserId: mongoose.Types.ObjectId,
  orgId: string,
  input: MarkEligibleInput
): Promise<RewardVerificationDTO> {
  await assertPropertyInOrg(input.propertyId, orgId);

  const doc = await RewardVerificationModel.create({
    orgId: new mongoose.Types.ObjectId(orgId),
    propertyId: new mongoose.Types.ObjectId(input.propertyId),
    unitId: input.unitId ? new mongoose.Types.ObjectId(input.unitId) : null,
    tenantUserId: new mongoose.Types.ObjectId(input.tenantUserId),
    campaignId: input.campaignId ? new mongoose.Types.ObjectId(input.campaignId) : null,
    eligibleBehavior: input.eligibleBehavior,
    rewardType: input.rewardType ?? 'POINTS',
    creditsRequested: input.creditsRequested ?? null,
    status: 'ELIGIBLE',
    markedEligibleBy: actorUserId,
    markedEligibleAt: new Date(),
  });

  AuditEvent.create({
    actorUserId,
    orgId: new mongoose.Types.ObjectId(orgId),
    action: 'REWARD_VERIFICATION_MARKED_ELIGIBLE',
    entityType: 'RewardVerification',
    entityId: doc._id,
    source: 'user',
    updateType: 'manual',
    propertyId: doc.propertyId,
    tenantId: doc.tenantUserId,
  }).catch(() => {});

  return toDTO(doc);
}

/**
 * Tenant submits proof for a reward. If a matching ELIGIBLE row already exists (same
 * tenant/property/behavior/campaign), it's transitioned to SUBMITTED; otherwise a new
 * self-initiated row is created directly at SUBMITTED.
 */
export async function submitVerification(
  tenantUserId: mongoose.Types.ObjectId,
  input: SubmitVerificationInput
): Promise<RewardVerificationDTO> {
  const property = await PropertyModel.findById(input.propertyId).lean();
  if (!property) throw new AppError('Property not found', 404);

  await assertTenantHasTenancyAtProperty(tenantUserId, input.propertyId, input.unitId);

  const existing = await RewardVerificationModel.findOne({
    tenantUserId,
    propertyId: new mongoose.Types.ObjectId(input.propertyId),
    eligibleBehavior: input.eligibleBehavior,
    status: 'ELIGIBLE',
    ...(input.campaignId ? { campaignId: new mongoose.Types.ObjectId(input.campaignId) } : {}),
  });

  const now = new Date();
  let doc: mongoose.Document & IRewardVerification;
  if (existing) {
    existing.status = 'SUBMITTED';
    existing.proofNote = input.proofNote ?? null;
    existing.attachments = (input.attachments ?? []) as any;
    existing.submittedAt = now;
    if (input.creditsRequested !== undefined) existing.creditsRequested = input.creditsRequested;
    await existing.save();
    doc = existing as any;
  } else {
    doc = (await RewardVerificationModel.create({
      orgId: (property as any).orgId,
      propertyId: new mongoose.Types.ObjectId(input.propertyId),
      unitId: input.unitId ? new mongoose.Types.ObjectId(input.unitId) : null,
      tenantUserId,
      campaignId: input.campaignId ? new mongoose.Types.ObjectId(input.campaignId) : null,
      eligibleBehavior: input.eligibleBehavior,
      rewardType: input.rewardType ?? 'POINTS',
      proofNote: input.proofNote ?? null,
      attachments: input.attachments ?? [],
      creditsRequested: input.creditsRequested ?? null,
      status: 'SUBMITTED',
      submittedAt: now,
    })) as any;
  }

  AuditEvent.create({
    actorUserId: tenantUserId,
    orgId: doc.orgId,
    action: 'REWARD_VERIFICATION_SUBMITTED',
    entityType: 'RewardVerification',
    entityId: doc._id,
    source: 'user',
    updateType: 'manual',
    propertyId: doc.propertyId,
    tenantId: tenantUserId,
  }).catch(() => {});

  const ownerMembership = await Membership.findOne({ orgId: doc.orgId, roleInOrg: 'OWNER' }).lean().catch(() => null);
  if (ownerMembership) {
    notify({
      recipientId: (ownerMembership as any).userId,
      recipientRole: 'landlord',
      landlordId: (ownerMembership as any).userId,
      propertyId: doc.propertyId,
      unitId: doc.unitId ?? null,
      tenantId: tenantUserId,
      eventType: 'REWARD_SUBMITTED',
      eventTitle: 'Reward submitted for review',
      eventDescription: `A tenant submitted a reward for ${doc.eligibleBehavior}.`,
    });
  }

  return toDTO(doc);
}

/** Landlord/PM begins reviewing a submitted verification — moves it into the active review queue. */
export async function startVerificationReview(
  reviewerId: mongoose.Types.ObjectId,
  orgId: string,
  id: string
): Promise<RewardVerificationDTO> {
  const doc = await findOwned(id, orgId);
  if (doc.status !== 'SUBMITTED') {
    throw new AppError(`Cannot start review from status: ${doc.status}`, 400);
  }
  doc.status = 'PENDING_VERIFICATION';
  await doc.save();
  return toDTO(doc);
}

/**
 * Landlord/PM approves or denies a verification that's under review. Approval issues
 * RewardType credits via the ledger's REWARD kind (never TEPA ownership) and moves the
 * record straight to ISSUED — approval and fulfillment happen atomically here.
 */
export async function reviewVerification(
  reviewerId: mongoose.Types.ObjectId,
  orgId: string,
  id: string,
  input: ReviewVerificationInput
): Promise<RewardVerificationDTO> {
  const doc = await findOwned(id, orgId);
  if (doc.status !== 'PENDING_VERIFICATION' && doc.status !== 'SUBMITTED') {
    throw new AppError(`Cannot review a verification in status: ${doc.status}`, 400);
  }

  const statusBeforeReview = doc.status;

  doc.reviewedBy = reviewerId;
  doc.reviewedAt = new Date();

  if (input.action === 'DENY') {
    doc.status = 'DENIED';
    doc.denialReason = input.denialReason ?? null;
    await doc.save();

    AuditEvent.create({
      actorUserId: reviewerId,
      orgId: doc.orgId,
      action: 'REWARD_VERIFICATION_DENIED',
      entityType: 'RewardVerification',
      entityId: doc._id,
      source: 'user',
      updateType: 'manual',
      propertyId: doc.propertyId,
      tenantId: doc.tenantUserId,
      diff: { before: { status: statusBeforeReview }, after: { status: doc.status, denialReason: doc.denialReason } },
    }).catch(() => {});

    notify({
      recipientId: doc.tenantUserId,
      recipientRole: 'tenant',
      propertyId: doc.propertyId,
      unitId: doc.unitId ?? null,
      tenantId: doc.tenantUserId,
      eventType: 'REWARD_DENIED',
      eventTitle: 'Reward denied',
      eventDescription: `Your reward for ${doc.eligibleBehavior} was denied${doc.denialReason ? `: ${doc.denialReason}` : '.'}`,
    });

    return toDTO(doc);
  }

  const amount = input.creditsAwarded ?? doc.creditsRequested ?? 0;
  if (amount > 0) {
    await issueCreditsToTenant(
      {
        tenantUserId: doc.tenantUserId.toString(),
        amount,
        reason: `RPA reward approved: ${doc.eligibleBehavior}`,
        propertyId: doc.propertyId.toString(),
        unitId: doc.unitId?.toString(),
        idempotencyKey: `reward-verification-${doc._id.toString()}`,
        type: 'EARN',
      },
      doc.orgId.toString(),
      reviewerId
    );
  }
  doc.creditsAwarded = amount;
  doc.status = 'ISSUED';
  await doc.save();

  AuditEvent.create({
    actorUserId: reviewerId,
    orgId: doc.orgId,
    action: 'REWARD_VERIFICATION_ISSUED',
    entityType: 'RewardVerification',
    entityId: doc._id,
    source: 'user',
    updateType: 'manual',
    propertyId: doc.propertyId,
    tenantId: doc.tenantUserId,
    diff: { before: { status: statusBeforeReview }, after: { status: doc.status, creditsAwarded: doc.creditsAwarded } },
  }).catch(() => {});

  notify({
    recipientId: doc.tenantUserId,
    recipientRole: 'tenant',
    propertyId: doc.propertyId,
    unitId: doc.unitId ?? null,
    tenantId: doc.tenantUserId,
    eventType: 'REWARD_APPROVED',
    eventTitle: 'Reward approved',
    eventDescription: `Your reward for ${doc.eligibleBehavior} was approved${doc.creditsAwarded > 0 ? ` — ${doc.creditsAwarded} ${doc.rewardType.toLowerCase()} credited.` : '.'}`,
  });

  return toDTO(doc);
}

/** Tenant disputes a denial — only reachable from DENIED. */
export async function disputeVerification(
  tenantUserId: mongoose.Types.ObjectId,
  id: string,
  input: DisputeVerificationInput
): Promise<RewardVerificationDTO> {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError('Invalid verification id', 400);
  const doc = await RewardVerificationModel.findOne({
    _id: new mongoose.Types.ObjectId(id),
    tenantUserId,
  });
  if (!doc) throw new AppError('Reward verification not found', 404);
  if (doc.status !== 'DENIED') {
    throw new AppError('Only a denied reward can be disputed', 400);
  }

  doc.status = 'DISPUTED';
  doc.disputeReason = input.disputeReason;
  doc.disputedAt = new Date();
  await doc.save();

  AuditEvent.create({
    actorUserId: tenantUserId,
    orgId: doc.orgId,
    action: 'REWARD_VERIFICATION_DISPUTED',
    entityType: 'RewardVerification',
    entityId: doc._id,
    source: 'user',
    updateType: 'manual',
    propertyId: doc.propertyId,
    tenantId: tenantUserId,
    diff: { before: { status: 'DENIED' }, after: { status: doc.status } },
  }).catch(() => {});

  return toDTO(doc);
}

/** Landlord/PM/admin resolves a dispute — either upholds the original denial or overturns it and issues credits. */
export async function resolveDispute(
  resolverId: mongoose.Types.ObjectId,
  orgId: string,
  id: string,
  input: ResolveDisputeInput
): Promise<RewardVerificationDTO> {
  const doc = await findOwned(id, orgId);
  if (doc.status !== 'DISPUTED') {
    throw new AppError(`Cannot resolve a dispute from status: ${doc.status}`, 400);
  }

  doc.resolvedBy = resolverId;
  doc.resolvedAt = new Date();
  doc.resolutionNote = input.resolutionNote ?? null;

  if (input.outcome === 'OVERTURN') {
    const amount = input.creditsAwarded ?? doc.creditsRequested ?? 0;
    if (amount > 0) {
      await issueCreditsToTenant(
        {
          tenantUserId: doc.tenantUserId.toString(),
          amount,
          reason: `RPA reward dispute overturned: ${doc.eligibleBehavior}`,
          propertyId: doc.propertyId.toString(),
          unitId: doc.unitId?.toString(),
          idempotencyKey: `reward-verification-dispute-${doc._id.toString()}`,
          type: 'EARN',
        },
        doc.orgId.toString(),
        resolverId
      );
    }
    doc.creditsAwarded = amount;
    doc.resolutionOutcome = 'OVERTURNED';
  } else {
    doc.resolutionOutcome = 'UPHELD';
  }

  doc.status = 'RESOLVED';
  await doc.save();

  AuditEvent.create({
    actorUserId: resolverId,
    orgId: doc.orgId,
    action: 'REWARD_VERIFICATION_DISPUTE_RESOLVED',
    entityType: 'RewardVerification',
    entityId: doc._id,
    source: 'user',
    updateType: 'manual',
    propertyId: doc.propertyId,
    tenantId: doc.tenantUserId,
    diff: { before: { status: 'DISPUTED' }, after: { status: doc.status, resolutionOutcome: doc.resolutionOutcome, creditsAwarded: doc.creditsAwarded } },
  }).catch(() => {});

  return toDTO(doc);
}

/** Landlord/PM list, org-scoped, optionally filtered by property/status/tenant. */
export async function listVerifications(
  orgId: string,
  filter: ListVerificationsQuery
): Promise<RewardVerificationDTO[]> {
  const query: any = { orgId: new mongoose.Types.ObjectId(orgId) };
  if (filter.propertyId) query.propertyId = new mongoose.Types.ObjectId(filter.propertyId);
  if (filter.status) query.status = filter.status;
  if (filter.tenantUserId) query.tenantUserId = new mongoose.Types.ObjectId(filter.tenantUserId);

  const rows = await RewardVerificationModel.find(query).sort({ createdAt: -1 }).limit(200);
  return rows.map(toDTO);
}

/** Tenant's own reward verification history. */
export async function listVerificationsForTenant(
  tenantUserId: mongoose.Types.ObjectId
): Promise<RewardVerificationDTO[]> {
  const rows = await RewardVerificationModel.find({ tenantUserId }).sort({ createdAt: -1 }).limit(200);
  return rows.map(toDTO);
}
