import { Response } from 'express';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { getLandlordFinances } from '../services/landlordFinances.service';

export async function getLandlordFinancesHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.auth?._id) {
    errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return;
  }
  const month = typeof req.query.month === 'string' ? req.query.month : undefined;
  const result = await getLandlordFinances(req.auth._id as any, month, req.auth?.orgId);
  successResponse(res, result);
}
