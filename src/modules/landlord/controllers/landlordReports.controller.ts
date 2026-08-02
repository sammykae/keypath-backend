import { Response } from 'express';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import { getLandlordReports } from '../services/landlordReports.service';

export async function getLandlordReportsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.auth?._id) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const result = await getLandlordReports(req.auth._id as any);
    successResponse(res, result);
  } catch (err: any) {
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'REPORTS_FETCH_FAILED', err.message);
      return;
    }
    errorResponse(res, 500, 'REPORTS_FETCH_FAILED', 'Failed to fetch reports');
  }
}
