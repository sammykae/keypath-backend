import { Response } from 'express';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { getTokenSummary, getTokenActivity } from '../services/tokenSummary.service';

/**
 * GET /api/tenants/tokens/summary
 * Returns 4 KPI stats: total earned, redeemed, available balance, expiring soon.
 */
export async function getTokenSummaryHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const summary = await getTokenSummary(req.auth._id as any);
    successResponse(res, summary);
  } catch (e) {
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to fetch token summary');
  }
}

/**
 * GET /api/tenants/tokens/activity?limit=10
 * Returns recent token activity formatted for the UI activity table.
 */
export async function getTokenActivityHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const result = await getTokenActivity(req.auth._id as any, limit);
    successResponse(res, result);
  } catch (e) {
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to fetch token activity');
  }
}

