import { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import {
  inviteTenant,
  removeTenant,
  setTepaOptIn,
  resendTenantInvite,
  adjustTenantRewards
} from '../services/landlordTenantActions.service';

const InviteBody = z.object({
  unitId: z.string().min(1),
  email: z.string().email(),
  rentAmount: z.number().positive(),
  leaseStart: z.string().min(1),
  leaseEnd: z.string().min(1)
});

export async function inviteTenantHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.auth?._id) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const body = InviteBody.parse(req.body);
    const result = await inviteTenant(req.auth._id as any, body);
    successResponse(res, result, 201);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      errorResponse(res, 400, 'VALIDATION_ERROR', 'Validation error', err.issues);
      return;
    }
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'TENANT_ACTION_ERROR', err.message);
      return;
    }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to invite tenant');
  }
}

export async function removeTenantHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.auth?._id) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const { tenantUserId } = req.params;
    const tenancyId = req.query.tenancyId as string | undefined;
    const result = await removeTenant(req.auth._id as any, tenantUserId, tenancyId);
    successResponse(res, result);
  } catch (err: any) {
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'TENANT_ACTION_ERROR', err.message);
      return;
    }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to remove tenant');
  }
}

export async function setTepaOptInHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.auth?._id) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const { tenantUserId } = req.params;
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    const result = await setTepaOptIn(req.auth._id as any, tenantUserId, enabled);
    successResponse(res, result);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      errorResponse(res, 400, 'VALIDATION_ERROR', 'Validation error', err.issues);
      return;
    }
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'TENANT_ACTION_ERROR', err.message);
      return;
    }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to update TEPA status');
  }
}

export async function adjustTenantRewardsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.auth?._id) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const { tenantUserId } = req.params;
    const { amount, reason } = z.object({
      amount: z.number().positive(),
      reason: z.string().min(1)
    }).parse(req.body);
    const result = await adjustTenantRewards(req.auth._id as any, tenantUserId, { amount, reason });
    successResponse(res, result, 201);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      errorResponse(res, 400, 'VALIDATION_ERROR', 'Validation error', err.issues);
      return;
    }
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'TENANT_ACTION_ERROR', err.message);
      return;
    }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to adjust rewards');
  }
}

export async function resendTenantInviteHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.auth?._id) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const { tenantUserId } = req.params;
    const result = await resendTenantInvite(req.auth._id as any, tenantUserId);
    successResponse(res, result);
  } catch (err: any) {
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'TENANT_ACTION_ERROR', err.message);
      return;
    }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to resend invite');
  }
}
