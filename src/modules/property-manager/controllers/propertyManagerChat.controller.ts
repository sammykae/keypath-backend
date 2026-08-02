import { Response } from 'express';
import { z, ZodError } from 'zod';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import {
  findOrCreatePMLandlordThread,
  findOrCreatePMGroupThread,
} from '../../chat/services/chat.service';

const LandlordThreadSchema = z.object({
  propertyId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid propertyId'),
});

const GroupThreadSchema = z.object({
  propertyId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid propertyId'),
  tenantUserId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid tenantUserId'),
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

/** POST /api/property-manager/chat/landlord-threads */
export async function createPMLandlordThreadHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const { propertyId } = LandlordThreadSchema.parse(req.body);
    const result = await findOrCreatePMLandlordThread(req.auth._id.toString(), propertyId);
    successResponse(res, result, result.isNew ? 201 : 200);
  } catch (err) {
    handleError(res, err, 'Failed to create landlord thread');
  }
}

/** POST /api/property-manager/chat/group-threads */
export async function createPMGroupThreadHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const { propertyId, tenantUserId } = GroupThreadSchema.parse(req.body);
    const result = await findOrCreatePMGroupThread(req.auth._id.toString(), propertyId, tenantUserId);
    successResponse(res, result, result.isNew ? 201 : 200);
  } catch (err) {
    handleError(res, err, 'Failed to create group thread');
  }
}
