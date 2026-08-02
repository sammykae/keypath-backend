import { Response } from 'express';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { getTenantLeaderboard } from '../services/tenantLeaderboard.service';

export async function getTenantLeaderboardHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.auth?._id) {
    errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return;
  }
  try {
    const result = await getTenantLeaderboard(req.auth._id as any);
    successResponse(res, result);
  } catch (err: any) {
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to fetch leaderboard');
  }
}
