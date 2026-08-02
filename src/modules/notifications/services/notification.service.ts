import mongoose from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import {
  NotificationModel,
  INotification,
  NotificationEventType,
  NotificationRecipientRole,
} from '../models/notification.model';

export interface CreateNotificationInput {
  userId?: mongoose.Types.ObjectId | null;
  recipientId: mongoose.Types.ObjectId;
  recipientRole: NotificationRecipientRole;
  landlordId?: mongoose.Types.ObjectId | null;
  propertyId?: mongoose.Types.ObjectId | null;
  unitId?: mongoose.Types.ObjectId | null;
  tenantId?: mongoose.Types.ObjectId | null;
  eventType: NotificationEventType;
  eventTitle: string;
  eventDescription: string;
}

export interface NotificationDTO {
  id: string;
  recipientRole: NotificationRecipientRole;
  landlordId: string | null;
  propertyId: string | null;
  unitId: string | null;
  tenantId: string | null;
  eventType: NotificationEventType;
  eventTitle: string;
  eventDescription: string;
  readStatus: boolean;
  createdAt: string;
}

function toDTO(n: INotification): NotificationDTO {
  return {
    id: n._id.toString(),
    recipientRole: n.recipientRole,
    landlordId: n.landlordId?.toString() ?? null,
    propertyId: n.propertyId?.toString() ?? null,
    unitId: n.unitId?.toString() ?? null,
    tenantId: n.tenantId?.toString() ?? null,
    eventType: n.eventType,
    eventTitle: n.eventTitle,
    eventDescription: n.eventDescription,
    readStatus: n.readStatus,
    createdAt: n.createdAt.toISOString(),
  };
}

export async function createNotification(input: CreateNotificationInput): Promise<NotificationDTO> {
  const doc = await NotificationModel.create({ ...input, readStatus: false });
  return toDTO(doc);
}

/**
 * Fire-and-forget entry point for real action call sites — never throws,
 * never blocks or fails the action that triggered it. This is what every
 * wired event-generation site (maintenance, rewards, agreements, payments,
 * chat, tenant registration) calls.
 */
export function notify(input: CreateNotificationInput): void {
  NotificationModel.create({ ...input, readStatus: false }).catch(() => {});
}

export interface ListNotificationsResult {
  notifications: NotificationDTO[];
  nextCursor: string | null;
  unreadCount: number;
}

export async function listNotifications(
  recipientId: mongoose.Types.ObjectId,
  options: { limit?: number; cursor?: string; unreadOnly?: boolean } = {}
): Promise<ListNotificationsResult> {
  const limit = Math.min(100, Math.max(1, options.limit ?? 25));
  const query: any = { recipientId };
  if (options.unreadOnly) query.readStatus = false;
  if (options.cursor && mongoose.Types.ObjectId.isValid(options.cursor)) {
    query._id = { $lt: new mongoose.Types.ObjectId(options.cursor) };
  }

  const rows = await NotificationModel.find(query).sort({ _id: -1 }).limit(limit + 1);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1]._id.toString() : null;

  const unreadCount = await NotificationModel.countDocuments({ recipientId, readStatus: false });

  return { notifications: page.map(toDTO), nextCursor, unreadCount };
}

export async function getUnreadCount(recipientId: mongoose.Types.ObjectId): Promise<number> {
  return NotificationModel.countDocuments({ recipientId, readStatus: false });
}

export async function markNotificationRead(
  recipientId: mongoose.Types.ObjectId,
  notificationId: string
): Promise<NotificationDTO> {
  if (!mongoose.Types.ObjectId.isValid(notificationId)) throw new AppError('Invalid notification id', 400);
  const doc = await NotificationModel.findOneAndUpdate(
    { _id: new mongoose.Types.ObjectId(notificationId), recipientId },
    { $set: { readStatus: true } },
    { new: true }
  );
  if (!doc) throw new AppError('Notification not found', 404);
  return toDTO(doc);
}

export async function markAllNotificationsRead(recipientId: mongoose.Types.ObjectId): Promise<{ updated: number }> {
  const result = await NotificationModel.updateMany(
    { recipientId, readStatus: false },
    { $set: { readStatus: true } }
  );
  return { updated: result.modifiedCount ?? 0 };
}
