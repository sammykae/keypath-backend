import { Response } from 'express';
import mongoose from 'mongoose';
import { z, ZodError } from 'zod';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import {
  getGoodStanding,
  listGoodStandingForOrg,
  flagTenant,
  resolveFlag,
  setOverride,
} from '../services/goodStanding.service';
import { STANDING_FLAG_TYPES } from '../models/goodStanding.model';

const FlagSchema = z.object({
  type: z.enum(STANDING_FLAG_TYPES as [string, ...string[]]),
  note: z.string().min(1).max(1000),
});

const OverrideSchema = z.object({
  status: z.enum(['ACTIVE', 'AT_RISK', 'PAUSED', 'SUSPENDED']).nullable(),
  reason: z.string().min(1).max(1000).optional(),
}).refine((d) => d.status === null || Boolean(d.reason), {
  message: 'reason is required when setting an override',
  path: ['reason'],
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

function parseTenantId(res: Response, raw: string): mongoose.Types.ObjectId | null {
  if (!mongoose.Types.ObjectId.isValid(raw)) {
    errorResponse(res, 400, 'INVALID_ID', 'Invalid tenant user id');
    return null;
  }
  return new mongoose.Types.ObjectId(raw);
}

/** GET /api/tenants/good-standing — tenant's own status */
export async function getMyGoodStandingHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const standing = await getGoodStanding(new mongoose.Types.ObjectId(req.auth._id.toString()));
    successResponse(res, { standing });
  } catch (err) {
    handleError(res, err, 'Failed to fetch good standing');
  }
}

/** GET /api/landlord/good-standing — all tenants in org */
export async function listGoodStandingHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const tenants = await listGoodStandingForOrg(new mongoose.Types.ObjectId(req.auth._id.toString()));
    successResponse(res, { tenants });
  } catch (err) {
    handleError(res, err, 'Failed to list good standing');
  }
}

/** GET /api/landlord/good-standing/:tenantUserId */
export async function getTenantGoodStandingHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const tenantId = parseTenantId(res, req.params.tenantUserId);
    if (!tenantId) return;
    const standing = await getGoodStanding(tenantId);
    successResponse(res, { standing });
  } catch (err) {
    handleError(res, err, 'Failed to fetch good standing');
  }
}

/** POST /api/landlord/good-standing/:tenantUserId/flags */
export async function flagTenantHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const tenantId = parseTenantId(res, req.params.tenantUserId);
    if (!tenantId) return;
    const body = FlagSchema.parse(req.body);
    const standing = await flagTenant(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      tenantId,
      { type: body.type as any, note: body.note }
    );
    successResponse(res, { standing }, 201);
  } catch (err) {
    handleError(res, err, 'Failed to flag tenant');
  }
}

/** PATCH /api/landlord/good-standing/:tenantUserId/flags/:flagId/resolve */
export async function resolveFlagHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const tenantId = parseTenantId(res, req.params.tenantUserId);
    if (!tenantId) return;
    const standing = await resolveFlag(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      tenantId,
      req.params.flagId
    );
    successResponse(res, { standing });
  } catch (err) {
    handleError(res, err, 'Failed to resolve flag');
  }
}

/** PATCH /api/landlord/good-standing/:tenantUserId/override — ADMIN only */
export async function setOverrideHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const tenantId = parseTenantId(res, req.params.tenantUserId);
    if (!tenantId) return;
    const body = OverrideSchema.parse(req.body);
    const standing = await setOverride(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      tenantId,
      body.status ? { status: body.status, reason: body.reason! } : null
    );
    successResponse(res, { standing });
  } catch (err) {
    handleError(res, err, 'Failed to set override');
  }
}
