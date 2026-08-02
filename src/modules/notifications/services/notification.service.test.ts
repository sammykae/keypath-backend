import mongoose from 'mongoose';
import {
  createNotification,
  notify,
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from './notification.service';
import { NotificationModel } from '../models/notification.model';

const RECIPIENT_1 = new mongoose.Types.ObjectId();

jest.mock('../models/notification.model', () => {
  const actual = jest.requireActual('../models/notification.model');
  return {
    ...actual,
    NotificationModel: {
      create: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
      findOneAndUpdate: jest.fn(),
      updateMany: jest.fn(),
    },
  };
});

function makeNotification(overrides: Record<string, any> = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    recipientId: RECIPIENT_1,
    recipientRole: 'tenant',
    landlordId: null,
    propertyId: null,
    unitId: null,
    tenantId: null,
    eventType: 'MAINTENANCE_SUBMITTED',
    eventTitle: 'Maintenance request submitted',
    eventDescription: 'Leaky sink',
    readStatus: false,
    createdAt: new Date(),
    ...overrides,
  };
}

const BASE_INPUT = {
  recipientId: RECIPIENT_1,
  recipientRole: 'tenant' as const,
  eventType: 'MAINTENANCE_SUBMITTED' as const,
  eventTitle: 'Maintenance request submitted',
  eventDescription: 'Leaky sink',
};

describe('createNotification', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates with readStatus false', async () => {
    (NotificationModel.create as jest.Mock).mockResolvedValue(makeNotification());

    const result = await createNotification(BASE_INPUT);

    expect(NotificationModel.create).toHaveBeenCalledWith(expect.objectContaining({ ...BASE_INPUT, readStatus: false }));
    expect(result.readStatus).toBe(false);
    expect(result.eventType).toBe('MAINTENANCE_SUBMITTED');
  });
});

describe('notify (fire-and-forget)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('never throws, even when the underlying create rejects', () => {
    (NotificationModel.create as jest.Mock).mockRejectedValue(new Error('db down'));
    expect(() => notify(BASE_INPUT)).not.toThrow();
  });

  it('calls NotificationModel.create with the given input', () => {
    (NotificationModel.create as jest.Mock).mockResolvedValue(makeNotification());
    notify(BASE_INPUT);
    expect(NotificationModel.create).toHaveBeenCalledWith(expect.objectContaining({ readStatus: false }));
  });
});

describe('listNotifications', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns paginated notifications with a nextCursor when there are more results', async () => {
    const rows = Array.from({ length: 3 }, () => makeNotification());
    (NotificationModel.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue(rows) }),
    });
    (NotificationModel.countDocuments as jest.Mock).mockResolvedValue(2);

    const result = await listNotifications(RECIPIENT_1, { limit: 2 });

    expect(result.notifications).toHaveLength(2);
    expect(result.nextCursor).toBe(rows[1]._id.toString());
    expect(result.unreadCount).toBe(2);
  });

  it('filters to unread only when requested', async () => {
    (NotificationModel.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }),
    });
    (NotificationModel.countDocuments as jest.Mock).mockResolvedValue(0);

    await listNotifications(RECIPIENT_1, { unreadOnly: true });

    expect(NotificationModel.find).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: RECIPIENT_1, readStatus: false })
    );
  });
});

describe('getUnreadCount', () => {
  beforeEach(() => jest.clearAllMocks());

  it('counts unread notifications for the recipient', async () => {
    (NotificationModel.countDocuments as jest.Mock).mockResolvedValue(5);
    const result = await getUnreadCount(RECIPIENT_1);
    expect(result).toBe(5);
    expect(NotificationModel.countDocuments).toHaveBeenCalledWith({ recipientId: RECIPIENT_1, readStatus: false });
  });
});

describe('markNotificationRead', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects an invalid notification id', async () => {
    await expect(markNotificationRead(RECIPIENT_1, 'not-an-id')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects when the notification does not belong to this recipient', async () => {
    (NotificationModel.findOneAndUpdate as jest.Mock).mockResolvedValue(null);
    await expect(
      markNotificationRead(RECIPIENT_1, new mongoose.Types.ObjectId().toString())
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('marks the notification read and returns it', async () => {
    const doc = makeNotification({ readStatus: true });
    (NotificationModel.findOneAndUpdate as jest.Mock).mockResolvedValue(doc);

    const result = await markNotificationRead(RECIPIENT_1, doc._id.toString());

    expect(NotificationModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: doc._id, recipientId: RECIPIENT_1 },
      { $set: { readStatus: true } },
      { new: true }
    );
    expect(result.readStatus).toBe(true);
  });
});

describe('markAllNotificationsRead', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the number of notifications updated', async () => {
    (NotificationModel.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 4 });
    const result = await markAllNotificationsRead(RECIPIENT_1);
    expect(result).toEqual({ updated: 4 });
    expect(NotificationModel.updateMany).toHaveBeenCalledWith(
      { recipientId: RECIPIENT_1, readStatus: false },
      { $set: { readStatus: true } }
    );
  });
});
