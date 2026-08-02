import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import { listComplianceForPM } from '../services/propertyManagerCompliance.service';

/** GET /api/property-manager/compliance/properties/:propertyId */
export async function listComplianceHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const result = await listComplianceForPM(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      req.params.propertyId
    );
    successResponse(res, { documents: result });
  } catch (err) {
    if (err instanceof AppError) { errorResponse(res, err.statusCode, 'APP_ERROR', err.message); return; }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to list compliance documents');
  }
}
