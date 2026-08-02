import { Response } from 'express';
import { ZodError } from 'zod';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import {
  getLandlordOrgId,
  listLandlordRewards,
  createLandlordReward,
  patchLandlordReward,
} from '../services/landlordRewards.service';
import { createLandlordRewardSchema, patchLandlordRewardSchema } from '../validation/landlordRewards.validation';

export async function getLandlordRewardsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const orgId = await getLandlordOrgId(req.auth!._id as any);
    const items = await listLandlordRewards(orgId);
    successResponse(res, { items });
  } catch (e) {
    if (e instanceof AppError) {
      errorResponse(res, e.statusCode, 'FORBIDDEN', e.message);
      return;
    }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to fetch rewards');
  }
}

export async function postLandlordRewardsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const orgId = await getLandlordOrgId(req.auth!._id as any);
    const parsed = createLandlordRewardSchema.parse(req.body);
    const item = await createLandlordReward(orgId, parsed);
    successResponse(res, { item }, 201);
  } catch (e) {
    if (e instanceof ZodError) {
      errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid request body', e.flatten().fieldErrors);
      return;
    }
    if (e instanceof AppError) {
      const status = e.statusCode === 409 ? 409 : e.statusCode;
      errorResponse(res, status, e.statusCode === 409 ? 'CONFLICT' : 'FORBIDDEN', e.message);
      return;
    }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to create reward');
  }
}

export async function patchLandlordRewardHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const orgId = await getLandlordOrgId(req.auth!._id as any);
    const id = req.params.id as string;
    const parsed = patchLandlordRewardSchema.parse(req.body);
    const item = await patchLandlordReward(orgId, id, parsed);
    successResponse(res, { item });
  } catch (e) {
    if (e instanceof ZodError) {
      errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid request body', e.flatten().fieldErrors);
      return;
    }
    if (e instanceof AppError) {
      errorResponse(res, e.statusCode, e.statusCode === 404 ? 'NOT_FOUND' : 'FORBIDDEN', e.message);
      return;
    }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to update reward');
  }
}
