import mongoose from 'mongoose';
import { MaintenanceTicketModel } from '../../maintenance/models/maintenanceTicket.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { NotificationReadModel } from '../../landlord/models/notificationRead.model';

export interface TenantNotificationItem {
  id: string;
  title: string;
  icon: 'bell' | 'user' | 'building' | 'alert' | 'check' | 'payment' | 'message';
  createdAt: string;
  relativeTime: string;
  action: string;
  isRead: boolean;
}

function toRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days} day${days === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString();
}

export async function getTenantNotifications(
  tenantUserId: mongoose.Types.ObjectId,
  limit = 20
): Promise<{ notifications: TenantNotificationItem[]; unreadCount: number }> {
  const readRecord = await NotificationReadModel.findOne({ userId: tenantUserId }).lean();
  const lastReadAt: Date = (readRecord as any)?.lastReadAt ?? new Date(0);

  const tickets = await MaintenanceTicketModel.find({ tenantUserId })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();

  const tenancies = await TenancyModel.find({
    tenantUserId,
    status: 'ACTIVE',
  }).lean();

  const items: { date: Date; item: TenantNotificationItem }[] = [];

  for (const t of tickets) {
    const updatedAt = (t as any).updatedAt ?? (t as any).createdAt;

    if (t.creditsAwarded > 0 && t.status === 'RESOLVED') {
      items.push({
        date: updatedAt,
        item: {
          id: `credit-${t._id}`,
          title: `+${t.creditsAwarded} credits awarded for: ${t.title}`,
          icon: 'check',
          action: 'CREDITS_AWARDED',
          createdAt: updatedAt.toISOString(),
          relativeTime: toRelativeTime(updatedAt),
          isRead: updatedAt <= lastReadAt,
        },
      });
    } else if (t.status === 'RESOLVED' || t.status === 'CLOSED') {
      items.push({
        date: updatedAt,
        item: {
          id: `resolved-${t._id}`,
          title: `Maintenance resolved: ${t.title}`,
          icon: 'check',
          action: 'MAINTENANCE_RESOLVED',
          createdAt: updatedAt.toISOString(),
          relativeTime: toRelativeTime(updatedAt),
          isRead: updatedAt <= lastReadAt,
        },
      });
    } else if (t.status === 'IN_PROGRESS') {
      items.push({
        date: updatedAt,
        item: {
          id: `inprogress-${t._id}`,
          title: `Maintenance in progress: ${t.title}`,
          icon: 'bell',
          action: 'MAINTENANCE_IN_PROGRESS',
          createdAt: updatedAt.toISOString(),
          relativeTime: toRelativeTime(updatedAt),
          isRead: updatedAt <= lastReadAt,
        },
      });
    } else {
      const createdAt = (t as any).createdAt;
      items.push({
        date: createdAt,
        item: {
          id: `submitted-${t._id}`,
          title: `Request submitted: ${t.title}`,
          icon: 'building',
          action: 'MAINTENANCE_SUBMITTED',
          createdAt: createdAt.toISOString(),
          relativeTime: toRelativeTime(createdAt),
          isRead: createdAt <= lastReadAt,
        },
      });
    }
  }

  for (const ten of tenancies) {
    const end = new Date(ten.leaseEnd);
    const daysLeft = Math.floor((end.getTime() - Date.now()) / 86400000);
    if (daysLeft >= 0 && daysLeft <= 60) {
      const d = new Date();
      items.push({
        date: d,
        item: {
          id: `lease-expiry-${ten._id}`,
          title: `Lease expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
          icon: 'alert',
          action: 'LEASE_EXPIRING',
          createdAt: d.toISOString(),
          relativeTime: 'Upcoming',
          isRead: false,
        },
      });
    }
  }

  items.sort((a, b) => b.date.getTime() - a.date.getTime());
  const notifications = items.slice(0, limit).map(i => i.item);
  const unreadCount = notifications.filter(n => !n.isRead).length;

  return { notifications, unreadCount };
}

export async function markTenantNotificationsRead(
  tenantUserId: mongoose.Types.ObjectId
): Promise<void> {
  await NotificationReadModel.findOneAndUpdate(
    { userId: tenantUserId },
    { $set: { lastReadAt: new Date() } },
    { upsert: true }
  );
}
