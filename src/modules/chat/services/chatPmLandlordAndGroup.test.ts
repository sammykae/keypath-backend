import mongoose from 'mongoose';
import { findOrCreatePMLandlordThread, findOrCreatePMGroupThread } from './chat.service';
import { ConversationModel } from '../models/conversationModel';
import { User } from '../../auth/models/user.model';
import { Organization } from '../../orgs/models/organization.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { PropertyManagerAssignmentModel } from '../../property-manager/models/propertyManagerAssignment.model';
import { hasPMAccess } from '../../property-manager/services/propertyManager.service';

const PM_ID = new mongoose.Types.ObjectId('507f1f77bcf86cd799439003');
const LANDLORD_ID = new mongoose.Types.ObjectId('507f1f77bcf86cd799439004');
const TENANT_ID = new mongoose.Types.ObjectId('507f1f77bcf86cd799439001');
const ORG_ID = new mongoose.Types.ObjectId('507f1f77bcf86cd7994390aa');
const PROPERTY_ID = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
const UNIT_ID = new mongoose.Types.ObjectId('507f1f77bcf86cd799439021');

jest.mock('../../../core/socket/socketServer', () => ({ emitToThread: jest.fn(), emitToUser: jest.fn() }));
jest.mock('../models/conversationModel', () => ({ ConversationModel: { findOne: jest.fn(), create: jest.fn() } }));
jest.mock('../models/messageModel', () => ({ MessageModel: {} }));
jest.mock('./participantRules.service', () => ({
  getAccessibleConversations: jest.fn(),
  canAccessConversation: jest.fn(),
  canSendMessage: jest.fn(),
  canCreateConversation: jest.fn(),
  resolveOrgIdForUser: jest.fn(),
}));
jest.mock('../../auth/models/user.model', () => ({ User: { find: jest.fn(), findById: jest.fn() } }));
jest.mock('../../properties/models/propertyModel', () => ({ PropertyModel: { findById: jest.fn() } }));
jest.mock('../../units/models/unit.model', () => ({ UnitModel: { find: jest.fn() } }));
jest.mock('../../tenancies/models/tenancyModel', () => ({ TenancyModel: { findOne: jest.fn() } }));
jest.mock('../../orgs/models/organization.model', () => ({ Organization: { findById: jest.fn() } }));
jest.mock('../../property-manager/models/propertyManagerAssignment.model', () => ({
  PropertyManagerAssignmentModel: { findOne: jest.fn() },
}));
jest.mock('../../property-manager/services/propertyManager.service', () => ({ hasPMAccess: jest.fn() }));

function leanChain<T>(value: T) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

const pmUser = { _id: PM_ID, role: 'PROPERTY_MANAGER', email: 'pm@test.com', profile: { firstName: 'Pat', lastName: 'Manager' } };
const landlordUser = { _id: LANDLORD_ID, role: 'LANDLORD', email: 'landlord@test.com', profile: { firstName: 'Larry', lastName: 'Landlord' } };
const tenantUser = { _id: TENANT_ID, role: 'TENANT', email: 'tenant@test.com', profile: { firstName: 'Tina', lastName: 'Tenant' } };

describe('findOrCreatePMLandlordThread', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ConversationModel.findOne as jest.Mock).mockReturnValue(leanChain(null));
    (ConversationModel.create as jest.Mock).mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
    (User.find as jest.Mock).mockReturnValue(leanChain([pmUser, landlordUser]));
    (Organization.findById as jest.Mock).mockReturnValue(leanChain({ settings: {} }));
  });

  it('rejects when the PM has no active assignment on the property', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(leanChain(null));

    await expect(
      findOrCreatePMLandlordThread(PM_ID.toString(), PROPERTY_ID.toString())
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects when MESSAGE_LANDLORD is not granted', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ orgId: ORG_ID, landlordUserId: LANDLORD_ID, permissions: ['MESSAGE_TENANT'] })
    );

    await expect(
      findOrCreatePMLandlordThread(PM_ID.toString(), PROPERTY_ID.toString())
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects when the property has no landlord (independent account)', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ orgId: ORG_ID, landlordUserId: null, permissions: ['MESSAGE_LANDLORD'] })
    );

    await expect(
      findOrCreatePMLandlordThread(PM_ID.toString(), PROPERTY_ID.toString())
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('derives the landlord from the assignment (not client input) and creates the thread', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ orgId: ORG_ID, landlordUserId: LANDLORD_ID, permissions: ['MESSAGE_LANDLORD'] })
    );
    (hasPMAccess as jest.Mock).mockResolvedValue(true);

    const result = await findOrCreatePMLandlordThread(PM_ID.toString(), PROPERTY_ID.toString());

    expect(result).toEqual({ threadId: expect.any(String), isNew: true });
    expect(ConversationModel.create).toHaveBeenCalled();
  });
});

describe('findOrCreatePMGroupThread', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ConversationModel.findOne as jest.Mock).mockReturnValue(leanChain(null));
    (ConversationModel.create as jest.Mock).mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
    (User.find as jest.Mock).mockReturnValue(leanChain([pmUser, landlordUser, tenantUser]));
    (PropertyModel.findById as jest.Mock).mockReturnValue(leanChain({ name: 'Maple St' }));
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: UNIT_ID }]));
  });

  function baseAssignment(overrides: Record<string, any> = {}) {
    return {
      orgId: ORG_ID,
      propertyId: PROPERTY_ID,
      landlordUserId: LANDLORD_ID,
      permissions: ['MESSAGE_TENANT'],
      allowGroupChat: true,
      unitIds: undefined,
      ...overrides,
    };
  }

  it('rejects when the PM has no active assignment on the property', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(leanChain(null));
    await expect(
      findOrCreatePMGroupThread(PM_ID.toString(), PROPERTY_ID.toString(), TENANT_ID.toString())
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects when MESSAGE_TENANT is not granted', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(leanChain(baseAssignment({ permissions: [] })));
    await expect(
      findOrCreatePMGroupThread(PM_ID.toString(), PROPERTY_ID.toString(), TENANT_ID.toString())
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects when allowGroupChat is off (the default)', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(leanChain(baseAssignment({ allowGroupChat: false })));
    await expect(
      findOrCreatePMGroupThread(PM_ID.toString(), PROPERTY_ID.toString(), TENANT_ID.toString())
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(ConversationModel.create).not.toHaveBeenCalled();
  });

  it('rejects when the property has no landlord (independent account)', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(leanChain(baseAssignment({ landlordUserId: null })));
    await expect(
      findOrCreatePMGroupThread(PM_ID.toString(), PROPERTY_ID.toString(), TENANT_ID.toString())
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a tenant with no active tenancy on this property', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(leanChain(baseAssignment()));
    (TenancyModel.findOne as jest.Mock).mockReturnValue(leanChain(null));

    await expect(
      findOrCreatePMGroupThread(PM_ID.toString(), PROPERTY_ID.toString(), TENANT_ID.toString())
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('creates a 3-party group thread when all conditions are met', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(leanChain(baseAssignment()));
    (TenancyModel.findOne as jest.Mock).mockReturnValue(leanChain({ tenantUserId: TENANT_ID, unitId: UNIT_ID, status: 'ACTIVE' }));

    const result = await findOrCreatePMGroupThread(PM_ID.toString(), PROPERTY_ID.toString(), TENANT_ID.toString());

    expect(result).toEqual({ threadId: expect.any(String), isNew: true });
    const createArgs = (ConversationModel.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.type).toBe('group');
    expect(createArgs.participants).toHaveLength(3);
  });

  it('honors a unit-level restriction when validating the tenant', async () => {
    const otherUnit = new mongoose.Types.ObjectId();
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain(baseAssignment({ unitIds: [otherUnit] }))
    );
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: otherUnit }]));
    (TenancyModel.findOne as jest.Mock).mockReturnValue(leanChain(null)); // tenant is on UNIT_ID, not otherUnit

    await expect(
      findOrCreatePMGroupThread(PM_ID.toString(), PROPERTY_ID.toString(), TENANT_ID.toString())
    ).rejects.toMatchObject({ statusCode: 403 });

    // Confirm the unit query was scoped to the restricted unit, not the whole property
    const unitFilter = (UnitModel.find as jest.Mock).mock.calls[0][0];
    expect(unitFilter._id.$in).toEqual([otherUnit]);
  });

  it('reuses an existing group thread instead of creating a duplicate', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(leanChain(baseAssignment()));
    (TenancyModel.findOne as jest.Mock).mockReturnValue(leanChain({ tenantUserId: TENANT_ID, unitId: UNIT_ID, status: 'ACTIVE' }));
    (ConversationModel.findOne as jest.Mock).mockReturnValue(leanChain({ _id: new mongoose.Types.ObjectId() }));

    const result = await findOrCreatePMGroupThread(PM_ID.toString(), PROPERTY_ID.toString(), TENANT_ID.toString());

    expect(result.isNew).toBe(false);
    expect(ConversationModel.create).not.toHaveBeenCalled();
  });
});
