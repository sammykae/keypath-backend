import mongoose from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { TenantChallengeModel, ITenantChallenge } from '../models/tenantChallenge.model';
import { ChallengeParticipationModel, ChallengeParticipationStatus } from '../models/challengeParticipation.model';
import { issueCreditsToTenant } from '../../ledger/services/issueCredits.service';

export interface TenantChallengeItem {
  id: string;
  challengeId: string;
  title: string;
  description: string;
  rewardPoints: number;
  rewardTokens: number;
  detail: string;
  actionLabel: string;
  verificationMode: string;
  endDate?: string | null;
  location?: string | null;
  participation?: {
    status: ChallengeParticipationStatus;
    submittedAt?: string | null;
    rewardIssued: boolean;
  } | null;
}

export interface CreateChallengeInput {
  challengeId: string;
  title: string;
  description: string;
  rewardPoints: number;
  detail?: string;
  actionLabel: string;
  verificationMode?: 'AUTOMATIC' | 'MANUAL';
  creatorType: 'ADMIN' | 'LANDLORD' | 'PROPERTY_MANAGER';
  createdBy?: mongoose.Types.ObjectId;
  orgId?: mongoose.Types.ObjectId | null;
  propertyId?: mongoose.Types.ObjectId | null;
  startDate?: Date | null;
  endDate?: Date | null;
  location?: string | null;
  maxParticipants?: number | null;
}

// ── Tenant-facing ──────────────────────────────────────────────────────────────

export async function getActiveChallenges(): Promise<TenantChallengeItem[]> {
  const challenges = await TenantChallengeModel.find({ status: 'active' }).lean();
  return challenges.map(mapChallenge);
}

export async function getActiveChallengesForTenant(
  tenantUserId: mongoose.Types.ObjectId
): Promise<TenantChallengeItem[]> {
  const [challenges, participations] = await Promise.all([
    TenantChallengeModel.find({ status: 'active' }).lean(),
    ChallengeParticipationModel.find({ tenantUserId }).lean(),
  ]);

  const partByChallenge = new Map<string, any>();
  for (const p of participations) {
    partByChallenge.set(p.challengeId.toString(), p);
  }

  return challenges.map((c: any) => {
    const p = partByChallenge.get(c._id.toString());
    return {
      ...mapChallenge(c),
      participation: p
        ? {
            status: p.status,
            submittedAt: p.submittedAt?.toISOString() ?? null,
            rewardIssued: p.rewardIssued,
          }
        : null,
    };
  });
}

export async function claimChallenge(
  tenantUserId: mongoose.Types.ObjectId,
  challengeDocId: string
): Promise<{ participationId: string; status: ChallengeParticipationStatus }> {
  if (!mongoose.Types.ObjectId.isValid(challengeDocId)) {
    throw new AppError('Invalid challenge id', 400);
  }
  const challenge = await TenantChallengeModel.findById(challengeDocId).lean();
  if (!challenge || challenge.status !== 'active') {
    throw new AppError('Challenge not found or not active', 404);
  }

  // Check expiry
  if (challenge.endDate && new Date() > new Date(challenge.endDate)) {
    throw new AppError('Challenge has expired', 400);
  }

  const existing = await ChallengeParticipationModel.findOne({
    challengeId: new mongoose.Types.ObjectId(challengeDocId),
    tenantUserId,
  }).lean();
  if (existing) {
    throw new AppError('You have already claimed this challenge', 409);
  }

  // Auto-verified challenges jump straight to APPROVED
  const initialStatus: ChallengeParticipationStatus =
    challenge.verificationMode === 'AUTOMATIC' ? 'APPROVED' : 'IN_PROGRESS';

  const participation = await ChallengeParticipationModel.create({
    challengeId: new mongoose.Types.ObjectId(challengeDocId),
    tenantUserId,
    status: initialStatus,
    rewardIssued: false,
  });

  if (initialStatus === 'APPROVED' && challenge.rewardPoints > 0 && challenge.orgId) {
    try {
      await issueCreditsToTenant(
        {
          tenantUserId: tenantUserId.toString(),
          amount: challenge.rewardPoints,
          reason: `Challenge completed: ${challenge.title}`,
          idempotencyKey: `challenge-auto-${(participation._id as mongoose.Types.ObjectId).toString()}`,
          type: 'EARN',
        },
        challenge.orgId.toString(),
        tenantUserId
      );
      participation.rewardIssued = true;
      await participation.save();
    } catch (err) {
      console.error('[CHALLENGE_AUTO_CREDIT_FAILED]', err);
    }
  }

  return { participationId: (participation._id as mongoose.Types.ObjectId).toString(), status: initialStatus };
}

export async function submitChallengeProof(
  tenantUserId: mongoose.Types.ObjectId,
  challengeDocId: string,
  proofUrl?: string
): Promise<{ participationId: string; status: ChallengeParticipationStatus }> {
  if (!mongoose.Types.ObjectId.isValid(challengeDocId)) {
    throw new AppError('Invalid challenge id', 400);
  }

  const participation = await ChallengeParticipationModel.findOne({
    challengeId: new mongoose.Types.ObjectId(challengeDocId),
    tenantUserId,
  });
  if (!participation) {
    throw new AppError('No active participation found. Claim the challenge first.', 404);
  }
  if (participation.status !== 'IN_PROGRESS') {
    throw new AppError(`Cannot submit in current status: ${participation.status}`, 400);
  }

  participation.status = 'PENDING_REVIEW';
  participation.submittedAt = new Date();
  if (proofUrl) participation.proofUrl = proofUrl;
  await participation.save();

  return { participationId: (participation._id as mongoose.Types.ObjectId).toString(), status: participation.status };
}

export async function getChallengeHistory(
  tenantUserId: mongoose.Types.ObjectId
): Promise<any[]> {
  const participations = await ChallengeParticipationModel.find({ tenantUserId })
    .populate('challengeId', 'title description rewardPoints actionLabel')
    .sort({ createdAt: -1 })
    .lean();

  return participations.map((p: any) => ({
    participationId: p._id.toString(),
    challenge: p.challengeId
      ? {
          id: p.challengeId._id?.toString(),
          title: p.challengeId.title,
          description: p.challengeId.description,
          rewardPoints: p.challengeId.rewardPoints,
          actionLabel: p.challengeId.actionLabel,
        }
      : null,
    status: p.status,
    submittedAt: p.submittedAt?.toISOString() ?? null,
    reviewedAt: p.reviewedAt?.toISOString() ?? null,
    rejectionReason: p.rejectionReason ?? null,
    rewardIssued: p.rewardIssued,
    createdAt: p.createdAt.toISOString(),
  }));
}

// ── Landlord / Admin ───────────────────────────────────────────────────────────

export async function createChallenge(input: CreateChallengeInput): Promise<ITenantChallenge> {
  const existing = await TenantChallengeModel.findOne({ challengeId: input.challengeId }).lean();
  if (existing) {
    throw new AppError(`Challenge with challengeId "${input.challengeId}" already exists`, 409);
  }

  const doc = await TenantChallengeModel.create({
    challengeId: input.challengeId,
    title: input.title,
    description: input.description,
    rewardPoints: input.rewardPoints,
    rewardTokens: input.rewardPoints,
    detail: input.detail ?? '',
    actionLabel: input.actionLabel,
    verificationMode: input.verificationMode ?? 'MANUAL',
    creatorType: input.creatorType,
    createdBy: input.createdBy ?? null,
    orgId: input.orgId ?? null,
    propertyId: input.propertyId ?? null,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    location: input.location ?? null,
    maxParticipants: input.maxParticipants ?? null,
    status: 'active',
  });
  return doc;
}

export async function updateChallenge(
  challengeDocId: string,
  orgId: string | null,
  patch: Partial<CreateChallengeInput>
): Promise<ITenantChallenge> {
  if (!mongoose.Types.ObjectId.isValid(challengeDocId)) {
    throw new AppError('Invalid challenge id', 400);
  }
  const query: any = { _id: new mongoose.Types.ObjectId(challengeDocId) };
  if (orgId) query.orgId = new mongoose.Types.ObjectId(orgId);

  const doc = await TenantChallengeModel.findOne(query);
  if (!doc) throw new AppError('Challenge not found or access denied', 404);

  if (patch.title != null)            doc.title = patch.title;
  if (patch.description != null)      doc.description = patch.description;
  if (patch.rewardPoints != null) {   doc.rewardPoints = patch.rewardPoints; doc.rewardTokens = patch.rewardPoints; }
  if (patch.detail != null)           doc.detail = patch.detail;
  if (patch.actionLabel != null)      doc.actionLabel = patch.actionLabel;
  if (patch.verificationMode != null) doc.verificationMode = patch.verificationMode;
  if (patch.startDate !== undefined)  doc.startDate = patch.startDate ?? null;
  if (patch.endDate !== undefined)    doc.endDate = patch.endDate ?? null;
  if (patch.location !== undefined)   doc.location = patch.location ?? null;
  if (patch.maxParticipants !== undefined) doc.maxParticipants = patch.maxParticipants ?? null;

  await doc.save();
  return doc;
}

export async function deactivateChallenge(challengeDocId: string, orgId: string | null): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(challengeDocId)) {
    throw new AppError('Invalid challenge id', 400);
  }
  const query: any = { _id: new mongoose.Types.ObjectId(challengeDocId) };
  if (orgId) query.orgId = new mongoose.Types.ObjectId(orgId);

  const doc = await TenantChallengeModel.findOne(query);
  if (!doc) throw new AppError('Challenge not found or access denied', 404);

  doc.status = 'inactive';
  await doc.save();
}

export async function listChallengesForOrg(orgId: string | null): Promise<any[]> {
  const query: any = orgId ? { orgId: new mongoose.Types.ObjectId(orgId) } : {};
  const challenges = await TenantChallengeModel.find(query).sort({ createdAt: -1 }).lean();
  return challenges.map(mapChallenge);
}

export async function listParticipationsForChallenge(
  challengeDocId: string,
  orgId: string | null
): Promise<any[]> {
  if (!mongoose.Types.ObjectId.isValid(challengeDocId)) {
    throw new AppError('Invalid challenge id', 400);
  }

  // Verify landlord owns this challenge
  const query: any = { _id: new mongoose.Types.ObjectId(challengeDocId) };
  if (orgId) query.orgId = new mongoose.Types.ObjectId(orgId);
  const challenge = await TenantChallengeModel.findOne(query).lean();
  if (!challenge) throw new AppError('Challenge not found or access denied', 404);

  const participations = await ChallengeParticipationModel.find({
    challengeId: new mongoose.Types.ObjectId(challengeDocId),
  })
    .populate('tenantUserId', 'fullName email')
    .populate('reviewedBy', 'fullName email')
    .sort({ createdAt: -1 })
    .lean();

  return participations.map((p: any) => ({
    participationId: p._id.toString(),
    tenant: p.tenantUserId
      ? { id: p.tenantUserId._id?.toString(), name: p.tenantUserId.fullName, email: p.tenantUserId.email }
      : null,
    status: p.status,
    submittedAt: p.submittedAt?.toISOString() ?? null,
    proofUrl: p.proofUrl ?? null,
    reviewedBy: p.reviewedBy
      ? { id: p.reviewedBy._id?.toString(), name: p.reviewedBy.fullName }
      : null,
    reviewedAt: p.reviewedAt?.toISOString() ?? null,
    rejectionReason: p.rejectionReason ?? null,
    rewardIssued: p.rewardIssued,
    createdAt: p.createdAt.toISOString(),
  }));
}

export async function reviewParticipation(
  participationId: string,
  reviewerId: mongoose.Types.ObjectId,
  action: 'APPROVE' | 'REJECT',
  rejectionReason?: string
): Promise<{ participationId: string; status: ChallengeParticipationStatus }> {
  if (!mongoose.Types.ObjectId.isValid(participationId)) {
    throw new AppError('Invalid participation id', 400);
  }

  const participation = await ChallengeParticipationModel.findById(participationId);
  if (!participation) throw new AppError('Participation not found', 404);

  if (participation.status !== 'PENDING_REVIEW') {
    throw new AppError(`Cannot review participation in status: ${participation.status}`, 400);
  }

  if (action === 'APPROVE') {
    participation.status = 'APPROVED';
  } else {
    participation.status = 'REJECTED';
    participation.rejectionReason = rejectionReason ?? null;
  }
  participation.reviewedBy = reviewerId;
  participation.reviewedAt = new Date();
  await participation.save();

  if (action === 'APPROVE') {
    const challenge = await TenantChallengeModel.findById(participation.challengeId).lean();
    if (challenge && challenge.rewardPoints > 0 && challenge.orgId) {
      try {
        await issueCreditsToTenant(
          {
            tenantUserId: participation.tenantUserId.toString(),
            amount: challenge.rewardPoints,
            reason: `Challenge completed: ${challenge.title}`,
            idempotencyKey: `challenge-review-${participationId}`,
            type: 'EARN',
          },
          challenge.orgId.toString(),
          reviewerId
        );
        participation.rewardIssued = true;
        await participation.save();
      } catch (err) {
        console.error('[CHALLENGE_CREDIT_ISSUE_FAILED]', err);
      }
    }
  }

  return { participationId: (participation._id as mongoose.Types.ObjectId).toString(), status: participation.status };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function mapChallenge(c: any): TenantChallengeItem {
  return {
    id: c._id.toString(),
    challengeId: c.challengeId,
    title: c.title,
    description: c.description,
    rewardPoints: c.rewardPoints ?? c.rewardTokens ?? 0,
    rewardTokens: c.rewardTokens ?? c.rewardPoints ?? 0,
    detail: c.detail ?? '',
    actionLabel: c.actionLabel,
    verificationMode: c.verificationMode ?? 'MANUAL',
    endDate: c.endDate ? new Date(c.endDate).toISOString() : null,
    location: c.location ?? null,
  };
}
