import { Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import { resolveLandlordOrgId } from '../../landlord/services/landlordDashboard.service';
import {
  markTenantEligible,
  listVerifications,
  startVerificationReview,
  reviewVerification,
  resolveDispute,
} from '../services/rewardVerification.service';
import {
  MarkEligibleSchema,
  ReviewVerificationSchema,
  ResolveDisputeSchema,
  ListVerificationsQuerySchema,
} from '../dto/rewardVerification.dto';

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

/** GET /api/landlord/rewards/verifications?propertyId=&status=&tenantUserId= */
export async function listRewardVerificationsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const query = ListVerificationsQuerySchema.parse(req.query);
    const orgId = await resolveLandlordOrgId(new mongoose.Types.ObjectId(req.auth._id.toString()));
    const result = await listVerifications(orgId, query);
    successResponse(res, { verifications: result });
  } catch (err) {
    handleError(res, err, 'Failed to list reward verifications');
  }
}

/** POST /api/landlord/rewards/verifications */
export async function markEligibleHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const body = MarkEligibleSchema.parse(req.body);
    const userId = new mongoose.Types.ObjectId(req.auth._id.toString());
    const orgId = await resolveLandlordOrgId(userId);
    const result = await markTenantEligible(userId, orgId, body);
    successResponse(res, result, 201);
  } catch (err) {
    handleError(res, err, 'Failed to mark tenant eligible');
  }
}

/** PATCH /api/landlord/rewards/verifications/:id/start-review */
export async function startReviewHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const userId = new mongoose.Types.ObjectId(req.auth._id.toString());
    const orgId = await resolveLandlordOrgId(userId);
    const result = await startVerificationReview(userId, orgId, req.params.id);
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to start review');
  }
}

/** PATCH /api/landlord/rewards/verifications/:id/review */
export async function reviewRewardVerificationHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const body = ReviewVerificationSchema.parse(req.body);
    const userId = new mongoose.Types.ObjectId(req.auth._id.toString());
    const orgId = await resolveLandlordOrgId(userId);
    const result = await reviewVerification(userId, orgId, req.params.id, body);
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to review reward verification');
  }
}

/** PATCH /api/landlord/rewards/verifications/:id/resolve-dispute */
export async function resolveDisputeHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const body = ResolveDisputeSchema.parse(req.body);
    const userId = new mongoose.Types.ObjectId(req.auth._id.toString());
    const orgId = await resolveLandlordOrgId(userId);
    const result = await resolveDispute(userId, orgId, req.params.id, body);
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to resolve dispute');
  }
}
