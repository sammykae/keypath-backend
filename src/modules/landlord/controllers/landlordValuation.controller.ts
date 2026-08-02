import { Response } from 'express';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import { getLandlordPropertyValuation } from '../services/landlordValuation.service';

export async function getLandlordValuationHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.auth?._id) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const result = await getLandlordPropertyValuation(
      req.auth._id as any,
      req.params.propertyId
    );
    successResponse(res, result);
  } catch (err: any) {
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'VALUATION_FETCH_FAILED', err.message);
      return;
    }
    errorResponse(res, 500, 'VALUATION_FETCH_FAILED', 'Failed to fetch valuation');
  }
}
