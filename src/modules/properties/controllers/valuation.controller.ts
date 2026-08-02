import { Response } from 'express';
import mongoose from 'mongoose';
import { z, ZodError } from 'zod';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import { resolveLandlordOrgId } from '../../landlord/services/landlordDashboard.service';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { UnitModel } from '../../units/models/unit.model';
import {
  recordValuation,
  listValuationHistory,
  getValuationStatus,
} from '../services/valuation.service';
import { VALUATION_METHODS, VALUATION_SOURCES } from '../models/valuationSnapshot.model';

const RecordValuationSchema = z.object({
  valuationUsd: z.number().positive(),
  method: z.enum(VALUATION_METHODS as [string, ...string[]]),
  source: z.enum(VALUATION_SOURCES as [string, ...string[]]).optional().default('MANUAL'),
  effectiveDate: z.coerce.date().optional(),
  notes: z.string().max(1000).optional(),
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

/** POST /api/landlord/properties/:propertyId/valuations */
export async function recordValuationHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const body = RecordValuationSchema.parse(req.body);
    const userId = new mongoose.Types.ObjectId(req.auth._id.toString());
    const orgId = await resolveLandlordOrgId(userId);
    const result = await recordValuation(userId, orgId, req.params.propertyId, body as any);
    successResponse(res, result, 201);
  } catch (err) {
    handleError(res, err, 'Failed to record valuation');
  }
}

/** GET /api/landlord/properties/:propertyId/valuations */
export async function listValuationsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const [history, status] = await Promise.all([
      listValuationHistory(req.params.propertyId),
      getValuationStatus(req.params.propertyId),
    ]);
    successResponse(res, { history, ...status });
  } catch (err) {
    handleError(res, err, 'Failed to list valuations');
  }
}

async function getTenantPropertyId(tenantUserId: mongoose.Types.ObjectId): Promise<string> {
  const tenancy = await TenancyModel.findOne({
    tenantUserId,
    status: { $in: ['ACTIVE', 'PENDING'] },
  }).sort({ updatedAt: -1 }).lean();
  if (!tenancy) throw new AppError('No active tenancy found', 404);
  const unit = await UnitModel.findById((tenancy as any).unitId).lean();
  if (!unit) throw new AppError('Unit not found', 404);
  return (unit as any).propertyId.toString();
}

/** GET /api/tenants/tepa/valuation */
export async function getMyPropertyValuationHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const tenantUserId = new mongoose.Types.ObjectId(req.auth._id.toString());
    const propertyId = await getTenantPropertyId(tenantUserId);
    const status = await getValuationStatus(propertyId);
    successResponse(res, status);
  } catch (err) {
    handleError(res, err, 'Failed to load valuation');
  }
}
