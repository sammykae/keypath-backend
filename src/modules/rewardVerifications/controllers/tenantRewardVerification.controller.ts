import { Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import {
  submitVerification,
  disputeVerification,
  listVerificationsForTenant,
} from '../services/rewardVerification.service';
import { SubmitVerificationSchema, DisputeVerificationSchema } from '../dto/rewardVerification.dto';

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

/** GET /api/tenants/rewards/verifications */
export async function listMyRewardVerificationsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const result = await listVerificationsForTenant(new mongoose.Types.ObjectId(req.auth._id.toString()));
    successResponse(res, { verifications: result });
  } catch (err) {
    handleError(res, err, 'Failed to list reward verifications');
  }
}

/** POST /api/tenants/rewards/verifications */
export async function submitRewardVerificationHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const body = SubmitVerificationSchema.parse(req.body);
    const result = await submitVerification(new mongoose.Types.ObjectId(req.auth._id.toString()), body);
    successResponse(res, result, 201);
  } catch (err) {
    handleError(res, err, 'Failed to submit reward verification');
  }
}

/** POST /api/tenants/rewards/verifications/:id/dispute */
export async function disputeRewardVerificationHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const body = DisputeVerificationSchema.parse(req.body);
    const result = await disputeVerification(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      req.params.id,
      body
    );
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to dispute reward verification');
  }
}
