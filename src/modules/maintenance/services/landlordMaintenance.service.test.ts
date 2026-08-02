import mongoose from 'mongoose';
import { updateMaintenanceTicket } from './landlordMaintenance.service';
import { MaintenanceTicketModel } from '../models/maintenanceTicket.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { Membership } from '../../orgs/models/membership.model';
import { User as UserModel } from '../../auth/models/user.model';
import { CreditAccountModel } from '../../ledger/models/creditAccountModel';
import { createCreditEventWithIdempotency } from '../../ledger/services/idempotencyService';
import { ActivityModel } from '../../activities/models/activityModel';
import { notify } from '../../notifications/services/notification.service';
import { AuditEvent } from '../../audit/models/audit-log.model';

const LANDLORD_USER = new mongoose.Types.ObjectId().toString();
const ORG_ID = new mongoose.Types.ObjectId();
const PROPERTY_A = new mongoose.Types.ObjectId();
const TENANT_1 = new mongoose.Types.ObjectId();

jest.mock('../models/maintenanceTicket.model', () => {
  const actual = jest.requireActual('../models/maintenanceTicket.model');
  return { ...actual, MaintenanceTicketModel: { findOne: jest.fn() } };
});
jest.mock('../../properties/models/propertyModel', () => ({ PropertyModel: { find: jest.fn(), findById: jest.fn() } }));
jest.mock('../../orgs/models/membership.model', () => ({ Membership: { findOne: jest.fn() } }));
jest.mock('../../auth/models/user.model', () => ({ User: { find: jest.fn(), findById: jest.fn() } }));
jest.mock('../../ledger/models/creditAccountModel', () => ({ CreditAccountModel: { findOne: jest.fn() } }));
jest.mock('../../ledger/services/idempotencyService', () => ({ createCreditEventWithIdempotency: jest.fn() }));
jest.mock('../../activities/models/activityModel', () => ({ ActivityModel: { create: jest.fn().mockResolvedValue(null) } }));
jest.mock('../../notifications/services/notification.service', () => ({ notify: jest.fn() }));
jest.mock('../../audit/models/audit-log.model', () => ({ AuditEvent: { create: jest.fn().mockResolvedValue(null) } }));
jest.mock('../../docs/storage', () => ({
  storage: {},
  S3Storage: jest.fn().mockImplementation(() => ({
    getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/file'),
  })),
}));

function leanChain<T>(value: T) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

describe('updateMaintenanceTicket', () => {
  beforeEach(() => jest.clearAllMocks());

  function makeTicket(overrides: Record<string, any> = {}) {
    const doc: any = {
      _id: new mongoose.Types.ObjectId(),
      propertyId: PROPERTY_A,
      unitId: null,
      tenantUserId: TENANT_1,
      title: 'Broken sink',
      description: '',
      issueType: 'PLUMBING',
      severity: 'LOW',
      status: 'OPEN',
      rewardEligible: null,
      rewardDecision: 'PENDING',
      creditsAwarded: 0,
      attachments: [],
      notes: [],
      resolvedAt: null,
      createdAt: new Date(),
      ...overrides,
    };
    doc.save = jest.fn().mockImplementation(async () => doc);
    return doc;
  }

  function mockCommonLookups() {
    (Membership.findOne as jest.Mock).mockReturnValue(leanChain({ orgId: ORG_ID }));
    (UserModel.findById as jest.Mock).mockReturnValue(leanChain({ email: 'tenant@test.com', profile: {} }));
    (PropertyModel.findById as jest.Mock).mockReturnValue(leanChain({ name: 'Maple St' }));
  }

  it('rejects when the ticket does not exist', async () => {
    mockCommonLookups();
    (MaintenanceTicketModel.findOne as jest.Mock).mockResolvedValue(null);
    await expect(
      updateMaintenanceTicket(LANDLORD_USER, new mongoose.Types.ObjectId().toString(), { status: 'IN_PROGRESS' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('persists a note on the ticket instead of discarding it when no credits are awarded', async () => {
    mockCommonLookups();
    const ticket = makeTicket();
    (MaintenanceTicketModel.findOne as jest.Mock).mockResolvedValue(ticket);

    const result = await updateMaintenanceTicket(LANDLORD_USER, ticket._id.toString(), {
      note: 'Plumber scheduled for Monday',
    });

    expect(ticket.notes).toHaveLength(1);
    expect(ticket.notes[0]).toMatchObject({ text: 'Plumber scheduled for Monday', authorRole: 'landlord' });
    expect(result.notes).toEqual([
      expect.objectContaining({ text: 'Plumber scheduled for Monday', authorRole: 'landlord' }),
    ]);
  });

  it('appends completion-evidence attachments to the ticket', async () => {
    mockCommonLookups();
    const ticket = makeTicket();
    (MaintenanceTicketModel.findOne as jest.Mock).mockResolvedValue(ticket);
    const attachment = { fileKey: 'maintenance/landlord/evidence.jpg', fileName: 'evidence.jpg', fileType: 'image/jpeg' };

    const result = await updateMaintenanceTicket(LANDLORD_USER, ticket._id.toString(), { attachments: [attachment] });

    expect(ticket.attachments).toEqual([attachment]);
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0]).toMatchObject(attachment);
  });

  it('fires an ActivityModel event on every update, not just credit awards', async () => {
    mockCommonLookups();
    const ticket = makeTicket();
    (MaintenanceTicketModel.findOne as jest.Mock).mockResolvedValue(ticket);

    await updateMaintenanceTicket(LANDLORD_USER, ticket._id.toString(), { status: 'IN_PROGRESS' });

    expect(ActivityModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MAINTENANCE_UPDATED', entity: { type: 'maintenance', id: ticket._id } })
    );
  });

  it('notifies the tenant when status changes', async () => {
    mockCommonLookups();
    const ticket = makeTicket();
    (MaintenanceTicketModel.findOne as jest.Mock).mockResolvedValue(ticket);

    await updateMaintenanceTicket(LANDLORD_USER, ticket._id.toString(), { status: 'IN_PROGRESS' });

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'MAINTENANCE_STATUS_CHANGED', recipientId: ticket.tenantUserId })
    );
  });

  it('writes a distinct MAINTENANCE_CLOSED audit event (with before/after status) when a ticket is closed', async () => {
    mockCommonLookups();
    const ticket = makeTicket({ status: 'IN_PROGRESS' });
    (MaintenanceTicketModel.findOne as jest.Mock).mockResolvedValue(ticket);

    await updateMaintenanceTicket(LANDLORD_USER, ticket._id.toString(), { status: 'CLOSED' });

    expect(AuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MAINTENANCE_CLOSED',
        entityType: 'MaintenanceTicket',
        entityId: ticket._id,
        diff: { before: { status: 'IN_PROGRESS' }, after: { status: 'CLOSED' } },
      })
    );
  });

  it('does not write MAINTENANCE_CLOSED for a non-closing status change', async () => {
    mockCommonLookups();
    const ticket = makeTicket({ status: 'OPEN' });
    (MaintenanceTicketModel.findOne as jest.Mock).mockResolvedValue(ticket);

    await updateMaintenanceTicket(LANDLORD_USER, ticket._id.toString(), { status: 'IN_PROGRESS' });

    expect(AuditEvent.create).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'MAINTENANCE_CLOSED' }));
  });

  it('does not notify the tenant when only a note is added (no status change)', async () => {
    mockCommonLookups();
    const ticket = makeTicket();
    (MaintenanceTicketModel.findOne as jest.Mock).mockResolvedValue(ticket);

    await updateMaintenanceTicket(LANDLORD_USER, ticket._id.toString(), { note: 'FYI' });

    expect(notify).not.toHaveBeenCalled();
  });

  it('still awards credits and marks the reward approved', async () => {
    mockCommonLookups();
    const ticket = makeTicket();
    (MaintenanceTicketModel.findOne as jest.Mock).mockResolvedValue(ticket);
    (CreditAccountModel.findOne as jest.Mock).mockReturnValue(leanChain({ _id: new mongoose.Types.ObjectId() }));
    (createCreditEventWithIdempotency as jest.Mock).mockResolvedValue({});

    const result = await updateMaintenanceTicket(LANDLORD_USER, ticket._id.toString(), { creditsToAward: 25 });

    expect(createCreditEventWithIdempotency).toHaveBeenCalled();
    expect(ticket.creditsAwarded).toBe(25);
    expect(result.rewardDecision).toBe('APPROVED');
  });
});
