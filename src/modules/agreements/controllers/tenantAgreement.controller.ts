import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import { getTenantAgreements, getAgreementForTenant } from '../services/agreement.service';

function handleError(res: Response, err: unknown, fallback: string): void {
  if (err instanceof AppError) {
    errorResponse(res, err.statusCode, 'APP_ERROR', err.message);
    return;
  }
  errorResponse(res, 500, 'INTERNAL_ERROR', fallback);
}

/** GET /api/tenants/agreements */
export async function listMyAgreementsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const result = await getTenantAgreements(new mongoose.Types.ObjectId(req.auth._id.toString()));
    successResponse(res, { agreements: result });
  } catch (err) {
    handleError(res, err, 'Failed to list agreements');
  }
}

/** GET /api/tenants/agreements/:agreementId — view/download, auto-marks SENT -> VIEWED */
export async function getMyAgreementHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const result = await getAgreementForTenant(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      req.params.agreementId
    );
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to load agreement');
  }
}
