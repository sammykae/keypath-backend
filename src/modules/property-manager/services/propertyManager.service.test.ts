import mongoose from 'mongoose';
import {
  assignPropertyManager,
  hasPMAccess,
  assertPMPermission,
  updateAssignmentPermissions,
  getAccessiblePropertyIds,
} from './propertyManager.service';
import { PropertyManagerAssignmentModel } from '../models/propertyManagerAssignment.model';
import { User } from '../../auth/models/user.model';
import { Membership } from '../../orgs/models/membership.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { AppError } from '../../../core/errors/AppError';

const ORG_A = '507f1f77bcf86cd7994390aa';
const LANDLORD_A = '507f1f77bcf86cd799439001';
const PROPERTY_A = '507f1f77bcf86cd799439011';
const PROPERTY_OTHER_ORG = '507f1f77bcf86cd799439099';
const PM_USER = '507f1f77bcf86cd799439021';

jest.mock('../../landlord/services/landlordDashboard.service', () => ({
  resolveLandlordOrgId: jest.fn().mockResolvedValue('507f1f77bcf86cd7994390aa'),
}));

jest.mock('../../audit/models/audit-log.model', () => ({
  AuditEvent: { create: jest.fn().mockResolvedValue(null) },
}));

jest.mock('../models/propertyManagerAssignment.model', () => ({
  PropertyManagerAssignmentModel: {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
  },
  PM_PERMISSIONS: [
    'ADD_TENANT', 'INVITE_TENANT', 'UPLOAD_TENANT_INFO', 'UPLOAD_NOTES',
    'SUBMIT_MAINTENANCE_UPDATES', 'MESSAGE_TENANT', 'UPLOAD_DOCUMENTS',
  ],
  DEFAULT_PM_PERMISSIONS: ['ADD_TENANT', 'INVITE_TENANT', 'UPLOAD_TENANT_INFO', 'UPLOAD_NOTES', 'SUBMIT_MAINTENANCE_UPDATES', 'MESSAGE_TENANT'],
}));

jest.mock('../../auth/models/user.model', () => ({
  User: { findOne: jest.fn(), create: jest.fn(), find: jest.fn() },
}));

jest.mock('../../orgs/models/membership.model', () => ({
  Membership: { findOne: jest.fn(), create: jest.fn().mockResolvedValue(null) },
}));

jest.mock('../../properties/models/propertyModel', () => ({
  PropertyModel: { findOne: jest.fn(), find: jest.fn() },
}));

function leanChain<T>(value: T) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

describe('propertyManager.service — RBAC / scoping', () => {
  beforeEach(() => jest.clearAllMocks());

  it('assignPropertyManager rejects a property outside the caller org (404 — does not leak existence)', async () => {
    (PropertyModel.findOne as jest.Mock).mockReturnValue(leanChain(null));

    await expect(
      assignPropertyManager(new mongoose.Types.ObjectId(LANDLORD_A), {
        email: 'pm@test.com',
        propertyId: PROPERTY_OTHER_ORG,
      })
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(PropertyManagerAssignmentModel.create).not.toHaveBeenCalled();
    expect((PropertyModel.findOne as jest.Mock).mock.calls[0][0].orgId.toString()).toBe(ORG_A);
  });

  it('assignPropertyManager rejects an existing user with a conflicting role', async () => {
    (PropertyModel.findOne as jest.Mock).mockReturnValue(leanChain({ _id: PROPERTY_A }));
    (User.findOne as jest.Mock).mockResolvedValue({ _id: 'x', role: 'TENANT', email: 'pm@test.com' });

    await expect(
      assignPropertyManager(new mongoose.Types.ObjectId(LANDLORD_A), {
        email: 'pm@test.com',
        propertyId: PROPERTY_A,
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('assignPropertyManager creates the PM user + membership + assignment when new', async () => {
    (PropertyModel.findOne as jest.Mock).mockReturnValue(leanChain({ _id: PROPERTY_A, name: 'Maple St' }));
    (User.findOne as jest.Mock).mockResolvedValue(null);
    (User.create as jest.Mock).mockResolvedValue({
      _id: new mongoose.Types.ObjectId(PM_USER), email: 'pm@test.com', role: 'PROPERTY_MANAGER',
    });
    (Membership.findOne as jest.Mock).mockReturnValue(leanChain(null));
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockResolvedValue(null);
    (PropertyManagerAssignmentModel.create as jest.Mock).mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
      permissions: ['MESSAGE_TENANT'],
      status: 'ACTIVE',
    });

    const result = await assignPropertyManager(new mongoose.Types.ObjectId(LANDLORD_A), {
      email: 'pm@test.com',
      propertyId: PROPERTY_A,
    });

    expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ role: 'PROPERTY_MANAGER' }));
    expect(Membership.create).toHaveBeenCalledWith(expect.objectContaining({ roleInOrg: 'MEMBER' }));
    expect(result.status).toBe('ACTIVE');
  });

  it('hasPMAccess returns false when no active assignment exists for the property', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(leanChain(null));
    const allowed = await hasPMAccess(new mongoose.Types.ObjectId(PM_USER), PROPERTY_A);
    expect(allowed).toBe(false);
  });

  it('hasPMAccess returns true when active and no specific permission required', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ permissions: ['UPLOAD_NOTES'] })
    );
    const allowed = await hasPMAccess(new mongoose.Types.ObjectId(PM_USER), PROPERTY_A);
    expect(allowed).toBe(true);
  });

  it('hasPMAccess enforces the specific permission requested', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ permissions: ['MESSAGE_TENANT'] })
    );
    const allowedForUpload = await hasPMAccess(new mongoose.Types.ObjectId(PM_USER), PROPERTY_A, 'UPLOAD_NOTES' as any);
    expect(allowedForUpload).toBe(false);

    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ permissions: ['MESSAGE_TENANT'] })
    );
    const allowedForMessage = await hasPMAccess(new mongoose.Types.ObjectId(PM_USER), PROPERTY_A, 'MESSAGE_TENANT' as any);
    expect(allowedForMessage).toBe(true);
  });

  it('getAccessiblePropertyIds only returns properties with an active assignment row (Property A ≠ Property B)', async () => {
    (PropertyManagerAssignmentModel.find as jest.Mock).mockReturnValue(
      leanChain([{ propertyId: new mongoose.Types.ObjectId(PROPERTY_A) }])
    );
    const ids = await getAccessiblePropertyIds(new mongoose.Types.ObjectId(PM_USER));
    expect(ids).toEqual([PROPERTY_A]);
    expect(ids).not.toContain(PROPERTY_OTHER_ORG);

    const filter = (PropertyManagerAssignmentModel.find as jest.Mock).mock.calls[0][0];
    expect(filter.status).toBe('ACTIVE');
  });

  describe('hasPMAccess — unit-level restriction', () => {
    const UNIT_ALLOWED = '507f1f77bcf86cd799439031';
    const UNIT_OTHER = '507f1f77bcf86cd799439032';

    it('unrestricted assignment (no unitIds) allows any unit on the property', async () => {
      (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
        leanChain({ permissions: ['MESSAGE_TENANT'] })
      );
      const allowed = await hasPMAccess(new mongoose.Types.ObjectId(PM_USER), PROPERTY_A, 'MESSAGE_TENANT' as any, UNIT_OTHER);
      expect(allowed).toBe(true);
    });

    it('unit-restricted assignment denies a unit outside the restriction', async () => {
      (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
        leanChain({ permissions: ['MESSAGE_TENANT'], unitIds: [new mongoose.Types.ObjectId(UNIT_ALLOWED)] })
      );
      const allowed = await hasPMAccess(new mongoose.Types.ObjectId(PM_USER), PROPERTY_A, 'MESSAGE_TENANT' as any, UNIT_OTHER);
      expect(allowed).toBe(false);
    });

    it('unit-restricted assignment allows a unit inside the restriction', async () => {
      (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
        leanChain({ permissions: ['MESSAGE_TENANT'], unitIds: [new mongoose.Types.ObjectId(UNIT_ALLOWED)] })
      );
      const allowed = await hasPMAccess(new mongoose.Types.ObjectId(PM_USER), PROPERTY_A, 'MESSAGE_TENANT' as any, UNIT_ALLOWED);
      expect(allowed).toBe(true);
    });
  });

  describe('assertPMPermission', () => {
    it('throws a 403 when the permission is missing', async () => {
      (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
        leanChain({ permissions: ['MESSAGE_TENANT'] })
      );
      await expect(
        assertPMPermission(new mongoose.Types.ObjectId(PM_USER), PROPERTY_A, 'RPA_VIEW' as any)
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('resolves silently when the permission is granted', async () => {
      (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
        leanChain({ permissions: ['RPA_VIEW'] })
      );
      await expect(
        assertPMPermission(new mongoose.Types.ObjectId(PM_USER), PROPERTY_A, 'RPA_VIEW' as any)
      ).resolves.toBeUndefined();
    });
  });

  describe('updateAssignmentPermissions', () => {
    function makeAssignmentDoc(overrides: Record<string, any> = {}) {
      const doc: any = {
        _id: new mongoose.Types.ObjectId(),
        orgId: new mongoose.Types.ObjectId(ORG_A),
        propertyId: new mongoose.Types.ObjectId(PROPERTY_A),
        permissions: ['MESSAGE_TENANT'],
        unitIds: undefined,
        allowGroupChat: false,
        status: 'ACTIVE',
        ...overrides,
      };
      doc.save = jest.fn().mockImplementation(async () => doc);
      return doc;
    }

    it('rejects an assignment not found in the caller org (404)', async () => {
      (PropertyManagerAssignmentModel.findOne as jest.Mock).mockResolvedValue(null);
      await expect(
        updateAssignmentPermissions(new mongoose.Types.ObjectId(LANDLORD_A), PROPERTY_A, { allowGroupChat: true })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('updates permissions, unitIds, and allowGroupChat, scoped to this assignment only', async () => {
      const doc = makeAssignmentDoc();
      (PropertyManagerAssignmentModel.findOne as jest.Mock).mockResolvedValue(doc);

      const UNIT = '507f1f77bcf86cd799439031';
      const result = await updateAssignmentPermissions(new mongoose.Types.ObjectId(LANDLORD_A), PROPERTY_A, {
        permissions: ['RPA_VIEW', 'TEPA_VIEW'] as any,
        unitIds: [UNIT],
        allowGroupChat: true,
      });

      expect(doc.permissions).toEqual(['RPA_VIEW', 'TEPA_VIEW']);
      expect(doc.allowGroupChat).toBe(true);
      expect(doc.unitIds?.[0].toString()).toBe(UNIT);
      expect(result.allowGroupChat).toBe(true);
      expect(doc.save).toHaveBeenCalled();
    });

    it('clears unitIds when explicitly passed null', async () => {
      const doc = makeAssignmentDoc({ unitIds: [new mongoose.Types.ObjectId()] });
      (PropertyManagerAssignmentModel.findOne as jest.Mock).mockResolvedValue(doc);

      await updateAssignmentPermissions(new mongoose.Types.ObjectId(LANDLORD_A), PROPERTY_A, { unitIds: null });

      expect(doc.unitIds).toBeUndefined();
    });
  });
});
