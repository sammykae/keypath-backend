import { Response } from 'express';
import mongoose from 'mongoose';
import { z, ZodError } from 'zod';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import { listLandlordContexts, getDashboardSummary } from '../services/propertyManagerDashboard.service';
import {
  listPropertiesForPM,
  listUnitsForPM,
  listTenantsForPM,
  listLeasesForPM,
  listMaintenanceForPM,
} from '../services/propertyManagerRecords.service';

const OrgIdQuerySchema = z.object({ orgId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'orgId is required') });
const OrgIdWithPropertySchema = OrgIdQuerySchema.extend({
  propertyId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
});

function handleError(res: Response, err: unknown, fallback: string): void {
  if (err instanceof ZodError) {
    errorResponse(res, 400, 'VALIDATION_ERROR', err.issues[0]?.message ?? 'orgId query param is required');
    return;
  }
  if (err instanceof AppError) {
    errorResponse(res, err.statusCode, 'APP_ERROR', err.message);
    return;
  }
  errorResponse(res, 500, 'INTERNAL_ERROR', fallback);
}

/** GET /api/property-manager/context/landlords */
export async function listLandlordContextsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const result = await listLandlordContexts(new mongoose.Types.ObjectId(req.auth._id.toString()));
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to list landlord contexts');
  }
}

/** GET /api/property-manager/dashboard/summary?orgId= */
export async function getDashboardSummaryHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const { orgId } = OrgIdQuerySchema.parse(req.query);
    const summary = await getDashboardSummary(new mongoose.Types.ObjectId(req.auth._id.toString()), orgId);
    successResponse(res, { summary });
  } catch (err) {
    handleError(res, err, 'Failed to load dashboard summary');
  }
}

/** GET /api/property-manager/properties?orgId= */
export async function listPropertiesHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const { orgId } = OrgIdQuerySchema.parse(req.query);
    const result = await listPropertiesForPM(new mongoose.Types.ObjectId(req.auth._id.toString()), orgId);
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to list properties');
  }
}

/** GET /api/property-manager/units?orgId=&propertyId= */
export async function listUnitsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const { orgId, propertyId } = OrgIdWithPropertySchema.parse(req.query);
    const result = await listUnitsForPM(new mongoose.Types.ObjectId(req.auth._id.toString()), orgId, propertyId);
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to list units');
  }
}

/** GET /api/property-manager/tenants?orgId=&propertyId= */
export async function listTenantsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const { orgId, propertyId } = OrgIdWithPropertySchema.parse(req.query);
    const result = await listTenantsForPM(new mongoose.Types.ObjectId(req.auth._id.toString()), orgId, propertyId);
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to list tenants');
  }
}

/** GET /api/property-manager/leases?orgId=&propertyId= */
export async function listLeasesHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const { orgId, propertyId } = OrgIdWithPropertySchema.parse(req.query);
    const result = await listLeasesForPM(new mongoose.Types.ObjectId(req.auth._id.toString()), orgId, propertyId);
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to list leases');
  }
}

/** GET /api/property-manager/maintenance?orgId=&propertyId= */
export async function listMaintenanceHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const { orgId, propertyId } = OrgIdWithPropertySchema.parse(req.query);
    const result = await listMaintenanceForPM(new mongoose.Types.ObjectId(req.auth._id.toString()), orgId, propertyId);
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to list maintenance tickets');
  }
}
