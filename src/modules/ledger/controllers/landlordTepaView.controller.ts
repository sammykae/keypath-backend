import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import {
  getTenantTEPASummaryForLandlord,
  getTenantTokenLedgerForLandlord,
} from '../services/landlordTepaView.service';

function handleError(res: Response, err: unknown, fallback: string): void {
  if (err instanceof AppError) {
    errorResponse(res, err.statusCode, 'APP_ERROR', err.message);
    return;
  }
  errorResponse(res, 500, 'INTERNAL_ERROR', fallback);
}

/** GET /api/landlord/tepa/tenants/:tenantUserId */
export async function getTenantTEPASummaryForLandlordHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const result = await getTenantTEPASummaryForLandlord(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      req.params.tenantUserId
    );
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to load tenant TEPA summary');
  }
}

/** GET /api/landlord/tepa/tenants/:tenantUserId/ledger?propertyId= */
export async function getTenantTokenLedgerForLandlordHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const propertyId = typeof req.query.propertyId === 'string' ? req.query.propertyId : undefined;
    const result = await getTenantTokenLedgerForLandlord(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      req.params.tenantUserId,
      propertyId
    );
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to load tenant token ledger');
  }
}
