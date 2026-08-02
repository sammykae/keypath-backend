import mongoose from 'mongoose';
import { ActivityModel } from '../../activities/models/activityModel';
import { NotificationReadModel } from '../models/notificationRead.model';
import { resolveLandlordOrgId } from './landlordDashboard.service';

export interface NotificationItem {
  id: string;
  title: string;
  icon: 'bell' | 'user' | 'building' | 'alert' | 'check' | 'payment' | 'message';
  createdAt: string;
  relativeTime: string;
  action: string;
  isRead: boolean;
}

const ACTION_MAP: Record<string, { title: string; icon: NotificationItem['icon'] }> = {
  TENANCY_CREATED:     { title: 'New tenancy created',           icon: 'user' },
  TENANCY_ENDED:       { title: 'Tenancy ended',                 icon: 'user' },
  PROPERTY_CREATED:    { title: 'New property added',            icon: 'building' },
  PROPERTY_UPDATED:    { title: 'Property updated',              icon: 'building' },
  PAYMENT_CREATED:     { title: 'Payment recorded',              icon: 'payment' },
  PAYMENT_UPDATED:     { title: 'Payment status updated',        icon: 'payment' },
  RENT_PAYMENT_PAID:   { title: 'Rent payment received',         icon: 'check' },
  PROFILE_UPDATED:     { title: 'Profile updated',               icon: 'user' },
  INVITE_SENT:         { title: 'Tenant invite sent',            icon: 'message' },
  CAMPAIGN_CREATED:    { title: 'Rewards campaign created',      icon: 'bell' },
  CAMPAIGN_UPDATED:    { title: 'Rewards campaign updated',      icon: 'bell' },
  CREDIT_ISSUED:       { title: 'Ownership credits issued',      icon: 'check' },
  COMPLIANCE_ALERT:    { title: 'Compliance alert raised',       icon: 'alert' },
  MAINTENANCE_SUBMITTED: { title: 'New maintenance request submitted', icon: 'building' },
};

function toRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)    return 'Just now';
  if (mins < 60)   return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)    return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)    return `${days} day${days === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString();
}

export async function getLandlordNotifications(
  userId: mongoose.Types.ObjectId,
  limit: number = 10,
  authOrgId?: string | null
): Promise<{ notifications: NotificationItem[]; unreadCount: number }> {
  const orgId = await resolveLandlordOrgId(userId, authOrgId);
  const orgOid = new mongoose.Types.ObjectId(orgId);

  // Get last read timestamp for this user
  const readRecord = await NotificationReadModel.findOne({ userId }).lean();
  const lastReadAt: Date = (readRecord as any)?.lastReadAt ?? new Date(0);

  const activities = await ActivityModel.find({ orgId: orgOid })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const notifications: NotificationItem[] = activities.map((a) => {
    const mapped = ACTION_MAP[a.action] ?? { title: a.action.replace(/_/g, ' '), icon: 'bell' as const };
    return {
      id: (a as any)._id.toString(),
      title: mapped.title,
      icon: mapped.icon,
      action: a.action,
      createdAt: (a.createdAt as Date).toISOString(),
      relativeTime: toRelativeTime(a.createdAt as Date),
      isRead: (a.createdAt as Date) <= lastReadAt,
    };
  });

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return { notifications, unreadCount };
}

export async function markNotificationsRead(userId: mongoose.Types.ObjectId): Promise<void> {
  await NotificationReadModel.findOneAndUpdate(
    { userId },
    { $set: { lastReadAt: new Date() } },
    { upsert: true }
  );
}
