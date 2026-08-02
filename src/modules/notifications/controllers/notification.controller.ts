import { Response } from 'express';
import mongoose from 'mongoose';
import { z, ZodError } from 'zod';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import {
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '../services/notification.service';

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  unreadOnly: z.coerce.boolean().optional(),
});

function handleError(res: Response, err: unknown, fallback: string): void {
  if (err instanceof ZodError) {
    errorResponse(res, 400, 'VALIDATION_ERROR', err.issues[0]?.message ?? 'Validation error');
    return;
  }
  if (err instanceof AppError) {
    errorResponse(res, err.statusCode, 'APP_ERROR', err.message);
    return;
  }
  errorResponse(res, 500, 'INTERNAL_ERROR', fallback);
}

/** GET /api/notifications?limit=&cursor=&unreadOnly= */
export async function listNotificationsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const query = ListQuerySchema.parse(req.query);
    const result = await listNotifications(new mongoose.Types.ObjectId(req.auth._id.toString()), query);
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to list notifications');
  }
}

/** GET /api/notifications/unread-count */
export async function getUnreadCountHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const count = await getUnreadCount(new mongoose.Types.ObjectId(req.auth._id.toString()));
    successResponse(res, { unreadCount: count });
  } catch (err) {
    handleError(res, err, 'Failed to get unread count');
  }
}

/** PATCH /api/notifications/:id/read */
export async function markNotificationReadHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const result = await markNotificationRead(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      req.params.id
    );
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to mark notification read');
  }
}

/** POST /api/notifications/mark-all-read */
export async function markAllNotificationsReadHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const result = await markAllNotificationsRead(new mongoose.Types.ObjectId(req.auth._id.toString()));
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to mark all notifications read');
  }
}
