import { Response } from 'express';
import mongoose from 'mongoose';
import { z, ZodError } from 'zod';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import {
  listRewardCatalogForPM,
  createRewardCatalogEntryForPM,
  listCampaignsForPM,
  createCampaignForPM,
  listChallengesForPM,
  createChallengeForPM,
  listPendingRedemptionsForPM,
  reviewRedemptionForPM,
  adjustTenantBalanceForPM,
  listVerificationsForPM,
  markTenantEligibleForPM,
  reviewVerificationForPM,
  resolveDisputeForPM,
} from '../services/propertyManagerRPA.service';
import { RewardsCampaignEligibleBehaviorSchema } from '../../rewardsCampaigns/dto/rewardsCampaignDTO';
import { RewardTypes } from '../../rewards/types/rewardType';
import {
  MarkEligibleSchema,
  ReviewVerificationSchema,
  ResolveDisputeSchema,
} from '../../rewardVerifications/dto/rewardVerification.dto';

const OrgIdQuerySchema = z.object({ orgId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'orgId is required') });
const OrgIdWithPropertySchema = OrgIdQuerySchema.extend({
  propertyId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
});

const CreateRewardSchema = z.object({
  rewardId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  costCredits: z.number().min(0),
  category: z.string().min(1),
  status: z.enum(['active', 'inactive']).default('active'),
  rewardType: z.string().optional(),
  requiresApproval: z.boolean().optional(),
  redemptionLimit: z.object({ type: z.string(), maxCount: z.number().optional() }).optional(),
});

const CreateCampaignSchema = z.object({
  propertyId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid propertyId'),
  goal: z.string().min(1),
  budget: z.number().min(0),
  eligibleBehaviors: z.array(RewardsCampaignEligibleBehaviorSchema).min(1),
  rewardType: z.enum(RewardTypes).optional().default('POINTS'),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

const CreateChallengeSchema = z.object({
  propertyId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid propertyId'),
  challengeId: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Must be lowercase kebab-case'),
  title: z.string().min(1),
  description: z.string().min(1),
  rewardPoints: z.number().int().min(0),
  detail: z.string().optional(),
  actionLabel: z.string().min(1),
  verificationMode: z.enum(['AUTOMATIC', 'MANUAL']).default('MANUAL'),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  location: z.string().optional().nullable(),
  maxParticipants: z.number().int().min(1).optional().nullable(),
});

const ReviewRedemptionSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  rejectionReason: z.string().optional(),
});

const AdjustBalanceSchema = z.object({
  propertyId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid propertyId'),
  amount: z.number(),
  reason: z.string().min(1),
});

function handleError(res: Response, err: unknown, fallback: string): void {
  if (err instanceof ZodError) {
    errorResponse(res, 400, 'VALIDATION_ERROR', err.issues[0]?.message ?? 'Validation error');
    return;
  }
  if (err instanceof AppError) {
    errorResponse(res, err.statusCode, 'APP_ERROR', err.message);
    return;
  }
  errorResponse(res, 500, 'INTERNAL_ERROR', fallback);
}

/** GET /api/property-manager/rpa/rewards?orgId= */
export async function listRewardsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const { orgId } = OrgIdQuerySchema.parse(req.query);
    const rewards = await listRewardCatalogForPM(new mongoose.Types.ObjectId(req.auth._id.toString()), orgId);
    successResponse(res, { rewards });
  } catch (err) {
    handleError(res, err, 'Failed to list rewards');
  }
}

/** POST /api/property-manager/rpa/rewards?orgId= */
export async function createRewardHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const { orgId } = OrgIdQuerySchema.parse(req.query);
    const body = CreateRewardSchema.parse(req.body);
    const reward = await createRewardCatalogEntryForPM(new mongoose.Types.ObjectId(req.auth._id.toString()), orgId, body as any);
    successResponse(res, { reward }, 201);
  } catch (err) {
    handleError(res, err, 'Failed to create reward');
  }
}

/** GET /api/property-manager/rpa/campaigns?orgId=&propertyId= */
export async function listCampaignsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const { orgId, propertyId } = OrgIdWithPropertySchema.parse(req.query);
    const result = await listCampaignsForPM(new mongoose.Types.ObjectId(req.auth._id.toString()), orgId, propertyId);
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to list campaigns');
  }
}

/** POST /api/property-manager/rpa/campaigns */
export async function createCampaignHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const { propertyId, ...body } = CreateCampaignSchema.parse(req.body);
    const campaign = await createCampaignForPM(new mongoose.Types.ObjectId(req.auth._id.toString()), propertyId, body);
    successResponse(res, { campaign }, 201);
  } catch (err) {
    handleError(res, err, 'Failed to create campaign');
  }
}

/** GET /api/property-manager/rpa/challenges?orgId=&propertyId= */
export async function listChallengesHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const { orgId, propertyId } = OrgIdWithPropertySchema.parse(req.query);
    const result = await listChallengesForPM(new mongoose.Types.ObjectId(req.auth._id.toString()), orgId, propertyId);
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to list challenges');
  }
}

/** POST /api/property-manager/rpa/challenges */
export async function createChallengeHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const { propertyId, ...body } = CreateChallengeSchema.parse(req.body);
    const challenge = await createChallengeForPM(new mongoose.Types.ObjectId(req.auth._id.toString()), propertyId, body as any);
    successResponse(res, { challenge }, 201);
  } catch (err) {
    handleError(res, err, 'Failed to create challenge');
  }
}

/** GET /api/property-manager/rpa/redemptions/pending?orgId= */
export async function listPendingRedemptionsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const { orgId } = OrgIdQuerySchema.parse(req.query);
    const result = await listPendingRedemptionsForPM(new mongoose.Types.ObjectId(req.auth._id.toString()), orgId);
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to list pending redemptions');
  }
}

/** PATCH /api/property-manager/rpa/redemptions/:redemptionId/review?orgId= */
export async function reviewRedemptionHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const { orgId } = OrgIdQuerySchema.parse(req.query);
    const body = ReviewRedemptionSchema.parse(req.body);
    const result = await reviewRedemptionForPM(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      orgId,
      req.params.redemptionId,
      body
    );
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to review redemption');
  }
}

/** POST /api/property-manager/rpa/tenants/:tenantUserId/adjust-balance */
export async function adjustBalanceHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const { propertyId, amount, reason } = AdjustBalanceSchema.parse(req.body);
    const result = await adjustTenantBalanceForPM(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      propertyId,
      req.params.tenantUserId,
      { amount, reason }
    );
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to adjust balance');
  }
}

// ── Reward verifications ──────────────────────────────────────────────────────

/** GET /api/property-manager/rpa/verifications?orgId=&propertyId= */
export async function listVerificationsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const { orgId, propertyId } = OrgIdWithPropertySchema.parse(req.query);
    const result = await listVerificationsForPM(new mongoose.Types.ObjectId(req.auth._id.toString()), orgId, propertyId);
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to list reward verifications');
  }
}

/** POST /api/property-manager/rpa/verifications */
export async function markEligibleHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const { propertyId, ...body } = MarkEligibleSchema.parse(req.body);
    const result = await markTenantEligibleForPM(new mongoose.Types.ObjectId(req.auth._id.toString()), propertyId, body);
    successResponse(res, result, 201);
  } catch (err) {
    handleError(res, err, 'Failed to mark tenant eligible');
  }
}

/** PATCH /api/property-manager/rpa/verifications/:verificationId/review?orgId= */
export async function reviewVerificationHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const { orgId } = OrgIdQuerySchema.parse(req.query);
    const body = ReviewVerificationSchema.parse(req.body);
    const result = await reviewVerificationForPM(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      orgId,
      req.params.verificationId,
      body
    );
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to review reward verification');
  }
}

/** PATCH /api/property-manager/rpa/verifications/:verificationId/resolve-dispute?orgId= */
export async function resolveDisputeHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const { orgId } = OrgIdQuerySchema.parse(req.query);
    const body = ResolveDisputeSchema.parse(req.body);
    const result = await resolveDisputeForPM(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      orgId,
      req.params.verificationId,
      body
    );
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to resolve dispute');
  }
}
