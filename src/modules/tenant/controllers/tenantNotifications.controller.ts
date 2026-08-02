import { Response } from 'express';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { getTenantNotifications, markTenantNotificationsRead } from '../services/tenantNotifications.service';

export async function getTenantNotificationsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required'); return; }
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const result = await getTenantNotifications(req.auth._id as any, limit);
  successResponse(res, result);
}

export async function markTenantNotificationsReadHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required'); return; }
  await markTenantNotificationsRead(req.auth._id as any);
  successResponse(res, { ok: true });
}
