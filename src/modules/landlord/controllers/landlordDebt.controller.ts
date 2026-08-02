import { Response } from 'express';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import { getLandlordDebt } from '../services/landlordDebt.service';

export async function getLandlordDebtHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.auth?._id) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const result = await getLandlordDebt(req.auth._id as any);
    successResponse(res, result);
  } catch (err: any) {
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'DEBT_ERROR', err.message);
      return;
    }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to fetch debt data');
  }
}
