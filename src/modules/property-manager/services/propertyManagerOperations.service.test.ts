import mongoose from 'mongoose';
import { addTenantForPM, updateMaintenanceForPM } from './propertyManagerOperations.service';
import { UnitModel } from '../../units/models/unit.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { TenantInviteModel } from '../../invites/models/tenantInvite.model';
import { User } from '../../auth/models/user.model';
import { MaintenanceTicketModel } from '../../maintenance/models/maintenanceTicket.model';
import { CreditAccountModel } from '../../ledger/models/creditAccountModel';
import { createCreditEventWithIdempotency } from '../../ledger/services/idempotencyService';
import { PropertyManagerAssignmentModel } from '../models/propertyManagerAssignment.model';
import { ActivityModel } from '../../activities/models/activityModel';
import { notify } from '../../notifications/services/notification.service';
import { AuditEvent } from '../../audit/models/audit-log.model';

const PM_USER = new mongoose.Types.ObjectId();
const ORG_ID = new mongoose.Types.ObjectId();
const PROPERTY_A = new mongoose.Types.ObjectId();
const UNIT_1 = new mongoose.Types.ObjectId();
const UNIT_2 = new mongoose.Types.ObjectId();
const TENANT_1 = new mongoose.Types.ObjectId();

jest.mock('../models/propertyManagerAssignment.model', () => ({
  PropertyManagerAssignmentModel: { findOne: jest.fn() },
}));
jest.mock('../../units/models/unit.model', () => ({ UnitModel: { findById: jest.fn() } }));
jest.mock('../../properties/models/propertyModel', () => ({ PropertyModel: { findById: jest.fn() } }));
jest.mock('../../tenancies/models/tenancyModel', () => ({ TenancyModel: { findOne: jest.fn(), create: jest.fn() } }));
jest.mock('../../invites/models/tenantInvite.model', () => ({ TenantInviteModel: { create: jest.fn() } }));
jest.mock('../../auth/models/user.model', () => ({ User: { findOne: jest.fn(), create: jest.fn() } }));
jest.mock('../../audit/models/audit-log.model', () => ({ AuditEvent: { create: jest.fn().mockResolvedValue(null) } }));
jest.mock('../../maintenance/models/maintenanceTicket.model', () => ({
  MaintenanceTicketModel: { findById: jest.fn() },
  MAINTENANCE_STATUS_LABELS: { OPEN: 'Submitted', RESOLVED: 'Completed' },
}));
jest.mock('../../ledger/models/creditAccountModel', () => ({ CreditAccountModel: { findOne: jest.fn() } }));
jest.mock('../../ledger/services/idempotencyService', () => ({ createCreditEventWithIdempotency: jest.fn() }));
jest.mock('../../activities/models/activityModel', () => ({ ActivityModel: { create: jest.fn().mockResolvedValue(null) } }));
jest.mock('../../notifications/services/notification.service', () => ({ notify: jest.fn() }));

function leanChain<T>(value: T) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

describe('addTenantForPM', () => {
  beforeEach(() => jest.clearAllMocks());

  const VALID_INPUT = {
    unitId: UNIT_1.toString(), email: 'tenant@test.com', rentAmount: 1500,
    leaseStart: '2026-01-01', leaseEnd: '2027-01-01',
  };

  it('rejects when the unit does not exist', async () => {
    (UnitModel.findById as jest.Mock).mockReturnValue(leanChain(null));
    await expect(addTenantForPM(PM_USER, VALID_INPUT)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects without an active assignment on the unit\'s property', async () => {
    (UnitModel.findById as jest.Mock).mockReturnValue(leanChain({ _id: UNIT_1, propertyId: PROPERTY_A }));
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(leanChain(null));
    await expect(addTenantForPM(PM_USER, VALID_INPUT)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects without ADD_TENANT permission', async () => {
    (UnitModel.findById as jest.Mock).mockReturnValue(leanChain({ _id: UNIT_1, propertyId: PROPERTY_A }));
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ orgId: ORG_ID, propertyId: PROPERTY_A, permissions: [] })
    );
    await expect(addTenantForPM(PM_USER, VALID_INPUT)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects a unit outside a unit-level restriction', async () => {
    (UnitModel.findById as jest.Mock).mockReturnValue(leanChain({ _id: UNIT_1, propertyId: PROPERTY_A }));
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ orgId: ORG_ID, propertyId: PROPERTY_A, permissions: ['ADD_TENANT'], unitIds: [UNIT_2] })
    );
    await expect(addTenantForPM(PM_USER, VALID_INPUT)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects when the unit already has an active/pending tenant', async () => {
    (UnitModel.findById as jest.Mock).mockReturnValue(leanChain({ _id: UNIT_1, propertyId: PROPERTY_A }));
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ orgId: ORG_ID, propertyId: PROPERTY_A, permissions: ['ADD_TENANT'] })
    );
    (TenancyModel.findOne as jest.Mock).mockReturnValue(leanChain({ status: 'ACTIVE' }));
    await expect(addTenantForPM(PM_USER, VALID_INPUT)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('creates a new tenant user, tenancy, and invite when granted', async () => {
    (UnitModel.findById as jest.Mock).mockReturnValue(leanChain({ _id: UNIT_1, propertyId: PROPERTY_A }));
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ orgId: ORG_ID, propertyId: PROPERTY_A, permissions: ['ADD_TENANT'] })
    );
    (TenancyModel.findOne as jest.Mock).mockReturnValue(leanChain(null));
    (User.findOne as jest.Mock).mockReturnValue(leanChain(null));
    (User.create as jest.Mock).mockResolvedValue({ _id: TENANT_1, email: 'tenant@test.com' });
    (TenancyModel.create as jest.Mock).mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
    (PropertyModel.findById as jest.Mock).mockReturnValue(leanChain({ name: 'Maple St' }));
    (TenantInviteModel.create as jest.Mock).mockResolvedValue({});

    const result = await addTenantForPM(PM_USER, VALID_INPUT);

    expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ role: 'TENANT' }));
    expect(TenancyModel.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'PENDING' }));
    expect(result.propertyName).toBe('Maple St');
    expect(result.inviteUrl).toContain('accept-invite?token=');
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'TENANT_REGISTERED' }));
  });

  it('reuses an existing user by email instead of creating a duplicate', async () => {
    (UnitModel.findById as jest.Mock).mockReturnValue(leanChain({ _id: UNIT_1, propertyId: PROPERTY_A }));
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ orgId: ORG_ID, propertyId: PROPERTY_A, permissions: ['ADD_TENANT'] })
    );
    (TenancyModel.findOne as jest.Mock).mockReturnValue(leanChain(null));
    (User.findOne as jest.Mock).mockReturnValue(leanChain({ _id: TENANT_1, email: 'tenant@test.com' }));
    (TenancyModel.create as jest.Mock).mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
    (PropertyModel.findById as jest.Mock).mockReturnValue(leanChain({ name: 'Maple St' }));
    (TenantInviteModel.create as jest.Mock).mockResolvedValue({});

    await addTenantForPM(PM_USER, VALID_INPUT);

    expect(User.create).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('updateMaintenanceForPM', () => {
  beforeEach(() => jest.clearAllMocks());

  function makeTicket(overrides: Record<string, any> = {}) {
    const doc: any = {
      _id: new mongoose.Types.ObjectId(),
      propertyId: PROPERTY_A,
      unitId: UNIT_1,
      tenantUserId: TENANT_1,
      title: 'Broken sink',
      status: 'OPEN',
      rewardEligible: null,
      rewardDecision: 'PENDING',
      creditsAwarded: 0,
      attachments: [],
      notes: [],
      resolvedAt: null,
      ...overrides,
    };
    doc.save = jest.fn().mockImplementation(async () => doc);
    return doc;
  }

  it('rejects when the ticket does not exist', async () => {
    (MaintenanceTicketModel.findById as jest.Mock).mockResolvedValue(null);
    await expect(updateMaintenanceForPM(PM_USER, new mongoose.Types.ObjectId().toString(), { status: 'IN_PROGRESS' as any }))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects without SUBMIT_MAINTENANCE_UPDATES', async () => {
    const ticket = makeTicket();
    (MaintenanceTicketModel.findById as jest.Mock).mockResolvedValue(ticket);
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ orgId: ORG_ID, propertyId: PROPERTY_A, permissions: [] })
    );
    await expect(updateMaintenanceForPM(PM_USER, ticket._id.toString(), { status: 'IN_PROGRESS' as any }))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it('allows a status-only update with just SUBMIT_MAINTENANCE_UPDATES', async () => {
    const ticket = makeTicket();
    (MaintenanceTicketModel.findById as jest.Mock).mockResolvedValue(ticket);
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ orgId: ORG_ID, propertyId: PROPERTY_A, permissions: ['SUBMIT_MAINTENANCE_UPDATES'] })
    );

    const result = await updateMaintenanceForPM(PM_USER, ticket._id.toString(), { status: 'RESOLVED' as any });

    expect(ticket.status).toBe('RESOLVED');
    expect(ticket.resolvedAt).toBeInstanceOf(Date);
    expect(result.status).toBe('RESOLVED');
  });

  it('rejects reward fields without MAINTENANCE_AWARD_REWARD, even with SUBMIT_MAINTENANCE_UPDATES', async () => {
    const ticket = makeTicket();
    (MaintenanceTicketModel.findById as jest.Mock).mockResolvedValue(ticket);
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ orgId: ORG_ID, propertyId: PROPERTY_A, permissions: ['SUBMIT_MAINTENANCE_UPDATES'] })
    );

    await expect(
      updateMaintenanceForPM(PM_USER, ticket._id.toString(), { creditsToAward: 50 })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(createCreditEventWithIdempotency).not.toHaveBeenCalled();
  });

  it('awards credits when MAINTENANCE_AWARD_REWARD is also granted', async () => {
    const ticket = makeTicket();
    (MaintenanceTicketModel.findById as jest.Mock).mockResolvedValue(ticket);
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ orgId: ORG_ID, propertyId: PROPERTY_A, permissions: ['SUBMIT_MAINTENANCE_UPDATES', 'MAINTENANCE_AWARD_REWARD'] })
    );
    (CreditAccountModel.findOne as jest.Mock).mockReturnValue(leanChain({ _id: new mongoose.Types.ObjectId() }));
    (createCreditEventWithIdempotency as jest.Mock).mockResolvedValue({});

    const result = await updateMaintenanceForPM(PM_USER, ticket._id.toString(), { creditsToAward: 50 });

    expect(createCreditEventWithIdempotency).toHaveBeenCalled();
    expect(ticket.creditsAwarded).toBe(50);
    expect(ticket.rewardDecision).toBe('APPROVED');
    expect(result.creditsAwarded).toBe(50);
  });

  it('rejects a ticket outside a unit-level restriction', async () => {
    const ticket = makeTicket({ unitId: UNIT_1 });
    (MaintenanceTicketModel.findById as jest.Mock).mockResolvedValue(ticket);
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ orgId: ORG_ID, propertyId: PROPERTY_A, permissions: ['SUBMIT_MAINTENANCE_UPDATES'], unitIds: [UNIT_2] })
    );

    await expect(
      updateMaintenanceForPM(PM_USER, ticket._id.toString(), { status: 'IN_PROGRESS' as any })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('persists a note on the ticket instead of discarding it when no credits are awarded', async () => {
    const ticket = makeTicket();
    (MaintenanceTicketModel.findById as jest.Mock).mockResolvedValue(ticket);
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ orgId: ORG_ID, propertyId: PROPERTY_A, permissions: ['SUBMIT_MAINTENANCE_UPDATES'] })
    );

    const result = await updateMaintenanceForPM(PM_USER, ticket._id.toString(), { note: 'Technician scheduled for Friday' });

    expect(ticket.notes).toHaveLength(1);
    expect(ticket.notes[0]).toMatchObject({ text: 'Technician scheduled for Friday', authorRole: 'property_manager' });
    expect(result.notes).toEqual([
      expect.objectContaining({ text: 'Technician scheduled for Friday', authorRole: 'property_manager' }),
    ]);
  });

  it('appends completion-evidence attachments to the ticket', async () => {
    const ticket = makeTicket();
    (MaintenanceTicketModel.findById as jest.Mock).mockResolvedValue(ticket);
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ orgId: ORG_ID, propertyId: PROPERTY_A, permissions: ['SUBMIT_MAINTENANCE_UPDATES'] })
    );
    const attachment = { fileKey: 'maintenance/pm/evidence.jpg', fileName: 'evidence.jpg', fileType: 'image/jpeg' };

    const result = await updateMaintenanceForPM(PM_USER, ticket._id.toString(), { attachments: [attachment] });

    expect(ticket.attachments).toEqual([attachment]);
    expect(result.attachments).toEqual([attachment]);
  });

  it('fires an ActivityModel event on every update, not just credit awards', async () => {
    const ticket = makeTicket();
    (MaintenanceTicketModel.findById as jest.Mock).mockResolvedValue(ticket);
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ orgId: ORG_ID, propertyId: PROPERTY_A, permissions: ['SUBMIT_MAINTENANCE_UPDATES'] })
    );

    await updateMaintenanceForPM(PM_USER, ticket._id.toString(), { status: 'IN_PROGRESS' as any });

    expect(ActivityModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MAINTENANCE_UPDATED', entity: { type: 'maintenance', id: ticket._id } })
    );
  });

  it('writes a distinct MAINTENANCE_CLOSED audit event (with before/after status) when a ticket is closed', async () => {
    const ticket = makeTicket({ status: 'IN_PROGRESS' });
    (MaintenanceTicketModel.findById as jest.Mock).mockResolvedValue(ticket);
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ orgId: ORG_ID, propertyId: PROPERTY_A, permissions: ['SUBMIT_MAINTENANCE_UPDATES'] })
    );

    await updateMaintenanceForPM(PM_USER, ticket._id.toString(), { status: 'CLOSED' as any });

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
    const ticket = makeTicket({ status: 'OPEN' });
    (MaintenanceTicketModel.findById as jest.Mock).mockResolvedValue(ticket);
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ orgId: ORG_ID, propertyId: PROPERTY_A, permissions: ['SUBMIT_MAINTENANCE_UPDATES'] })
    );

    await updateMaintenanceForPM(PM_USER, ticket._id.toString(), { status: 'IN_PROGRESS' as any });

    expect(AuditEvent.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MAINTENANCE_CLOSED' })
    );
  });
});
