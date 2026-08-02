import { Response } from 'express';
import { getLandlordDashboard } from '../services/landlordDashboard.service';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';

export async function getLandlordDashboardHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.auth?._id) {
    errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return;
  }
  const range = typeof req.query.range === 'string' ? req.query.range : undefined;
  const result = await getLandlordDashboard(req.auth._id as any, range, req.auth?.orgId);
  successResponse(res, result);
}
