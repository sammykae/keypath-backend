import { Response } from 'express';
import mongoose from 'mongoose';
import { z, ZodError } from 'zod';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import { addTenantForPM, updateMaintenanceForPM } from '../services/propertyManagerOperations.service';
import { MAINTENANCE_STATUSES } from '../../maintenance/models/maintenanceTicket.model';

const AddTenantSchema = z.object({
  unitId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid unitId'),
  email: z.string().email(),
  rentAmount: z.number().positive(),
  leaseStart: z.string().min(1),
  leaseEnd: z.string().min(1),
});

const AttachmentSchema = z.object({
  fileKey: z.string().min(1),
  fileName: z.string().min(1),
  fileType: z.string().min(1),
});

const UpdateMaintenanceSchema = z.object({
  status: z.enum(MAINTENANCE_STATUSES as [string, ...string[]]).optional(),
  note: z.string().max(2000).optional(),
  creditsToAward: z.number().positive().optional(),
  rewardEligible: z.boolean().optional(),
  rewardDecision: z.enum(['PENDING', 'APPROVED', 'DENIED']).optional(),
  attachments: z.array(AttachmentSchema).max(10).optional(),
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

/** POST /api/property-manager/tenants */
export async function addTenantHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const body = AddTenantSchema.parse(req.body);
    const result = await addTenantForPM(new mongoose.Types.ObjectId(req.auth._id.toString()), body);
    successResponse(res, result, 201);
  } catch (err) {
    handleError(res, err, 'Failed to add tenant');
  }
}

/** PATCH /api/property-manager/maintenance/:ticketId */
export async function updateMaintenanceHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const body = UpdateMaintenanceSchema.parse(req.body);
    const result = await updateMaintenanceForPM(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      req.params.ticketId,
      body as any
    );
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to update maintenance ticket');
  }
}
