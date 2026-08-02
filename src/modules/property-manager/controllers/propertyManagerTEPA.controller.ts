import { Response } from 'express';
import mongoose from 'mongoose';
import { z, ZodError } from 'zod';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import {
  getTenantTEPASummaryForPM,
  getTenantTokenLedgerForPM,
  getPropertyTEPASummaryForPM,
  listLiquidityRequestsForPM,
  getPropertyValuationForPM,
  listAgreementsForPM,
} from '../services/propertyManagerTEPA.service';

const PropertyIdQuerySchema = z.object({
  propertyId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'propertyId is required'),
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

/** GET /api/property-manager/tepa/tenants/:tenantUserId?propertyId= */
export async function getTenantTEPASummaryHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const { propertyId } = PropertyIdQuerySchema.parse(req.query);
    const summary = await getTenantTEPASummaryForPM(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      propertyId,
      req.params.tenantUserId
    );
    successResponse(res, { summary });
  } catch (err) {
    handleError(res, err, 'Failed to load TEPA summary');
  }
}

/** GET /api/property-manager/tepa/tenants/:tenantUserId/ledger?propertyId= */
export async function getTenantTokenLedgerHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const { propertyId } = PropertyIdQuerySchema.parse(req.query);
    const result = await getTenantTokenLedgerForPM(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      propertyId,
      req.params.tenantUserId
    );
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to load token ledger');
  }
}

/** GET /api/property-manager/tepa/properties/:propertyId/summary */
export async function getPropertyTEPASummaryHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const result = await getPropertyTEPASummaryForPM(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      req.params.propertyId
    );
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to load property TEPA summary');
  }
}

/** GET /api/property-manager/tepa/properties/:propertyId/valuation */
export async function getPropertyValuationHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const result = await getPropertyValuationForPM(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      req.params.propertyId
    );
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to load property valuation');
  }
}

/** GET /api/property-manager/tepa/properties/:propertyId/agreements */
export async function listAgreementsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const result = await listAgreementsForPM(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      req.params.propertyId
    );
    successResponse(res, { agreements: result });
  } catch (err) {
    handleError(res, err, 'Failed to list agreements');
  }
}

/** GET /api/property-manager/tepa/liquidity?propertyId= */
export async function listLiquidityRequestsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const { propertyId } = PropertyIdQuerySchema.parse(req.query);
    const result = await listLiquidityRequestsForPM(new mongoose.Types.ObjectId(req.auth._id.toString()), propertyId);
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to list liquidity requests');
  }
}
