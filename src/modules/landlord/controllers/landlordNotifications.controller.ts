import { Response } from 'express';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { getLandlordNotifications, markNotificationsRead } from '../services/landlordNotifications.service';
import { getLandlordAiSuggestions } from '../services/landlordAiSuggestions.service';

export async function getLandlordNotificationsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.auth?._id) {
    errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return;
  }
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const result = await getLandlordNotifications(req.auth._id as any, limit, req.auth?.orgId);
  successResponse(res, result);
}

export async function markNotificationsReadHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.auth?._id) {
    errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return;
  }
  await markNotificationsRead(req.auth._id as any);
  successResponse(res, { ok: true });
}

export async function getLandlordAiSuggestionsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.auth?._id) {
    errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return;
  }
  const result = await getLandlordAiSuggestions(req.auth._id as any, req.auth?.orgId);
  successResponse(res, result);
}
