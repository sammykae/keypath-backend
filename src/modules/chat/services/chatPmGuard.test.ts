import mongoose from 'mongoose';
import { findOrCreateDirectThread } from './chat.service';
import { ConversationModel } from '../models/conversationModel';
import { User } from '../../auth/models/user.model';
import { Organization } from '../../orgs/models/organization.model';
import { hasPMAccess } from '../../property-manager/services/propertyManager.service';

const ORG_ID = '507f1f77bcf86cd7994390aa';
const PM_ID = '507f1f77bcf86cd799439003';
const TENANT_ID = '507f1f77bcf86cd799439001';
const PROPERTY_ID = '507f1f77bcf86cd799439011';

jest.mock('../../../core/socket/socketServer', () => ({
  emitToThread: jest.fn(),
  emitToUser: jest.fn(),
}));

jest.mock('../models/conversationModel', () => ({
  ConversationModel: { findOne: jest.fn(), create: jest.fn() },
}));

jest.mock('../models/messageModel', () => ({ MessageModel: {} }));

jest.mock('./participantRules.service', () => ({
  getAccessibleConversations: jest.fn(),
  canAccessConversation: jest.fn(),
  canSendMessage: jest.fn(),
  canCreateConversation: jest.fn(),
  resolveOrgIdForUser: jest.fn(),
}));

jest.mock('../../auth/models/user.model', () => ({
  User: { find: jest.fn(), findById: jest.fn() },
}));

jest.mock('../../properties/models/propertyModel', () => ({
  PropertyModel: { findById: jest.fn() },
}));

jest.mock('../../orgs/models/organization.model', () => ({
  Organization: { findById: jest.fn() },
}));

jest.mock('../../property-manager/services/propertyManager.service', () => ({
  hasPMAccess: jest.fn(),
}));

function leanChain<T>(value: T) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

const pmUser = {
  _id: new mongoose.Types.ObjectId(PM_ID),
  role: 'PROPERTY_MANAGER',
  email: 'pm@test.com',
  profile: { firstName: 'Pat', lastName: 'Manager' },
};
const tenantUser = {
  _id: new mongoose.Types.ObjectId(TENANT_ID),
  role: 'TENANT',
  email: 'tenant@test.com',
  profile: { firstName: 'Tina', lastName: 'Tenant' },
};

describe('findOrCreateDirectThread — property manager chat guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ConversationModel.findOne as jest.Mock).mockReturnValue(leanChain(null));
    (User.find as jest.Mock).mockReturnValue(leanChain([pmUser, tenantUser]));
    (ConversationModel.create as jest.Mock).mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
    // Not relevant to the PM path, but findOrCreateDirectThread checks the
    // tenant/landlord toggle unconditionally first (no-op here since userB is a PM, not landlord).
    (Organization.findById as jest.Mock).mockReturnValue(leanChain({ settings: {} }));
  });

  it('blocks a PM from starting a tenant chat without a propertyId', async () => {
    const result = await findOrCreateDirectThread(PM_ID, TENANT_ID, ORG_ID);

    expect(result).toBeNull();
    expect(hasPMAccess).not.toHaveBeenCalled();
    expect(ConversationModel.create).not.toHaveBeenCalled();
  });

  it('blocks a PM without MESSAGE_TENANT permission on the property', async () => {
    (hasPMAccess as jest.Mock).mockResolvedValue(false);

    const result = await findOrCreateDirectThread(PM_ID, TENANT_ID, ORG_ID, PROPERTY_ID);

    expect(result).toBeNull();
    expect(hasPMAccess).toHaveBeenCalledWith(
      expect.objectContaining({ toString: expect.any(Function) }),
      PROPERTY_ID,
      'MESSAGE_TENANT'
    );
    expect(ConversationModel.create).not.toHaveBeenCalled();
  });

  it('allows a PM with MESSAGE_TENANT permission to start the chat', async () => {
    (hasPMAccess as jest.Mock).mockResolvedValue(true);

    const result = await findOrCreateDirectThread(PM_ID, TENANT_ID, ORG_ID, PROPERTY_ID);

    expect(result).toEqual({ threadId: expect.any(String), isNew: true });
    expect(ConversationModel.create).toHaveBeenCalled();
  });

  it('is symmetric regardless of which side (A or B) is the property manager', async () => {
    (hasPMAccess as jest.Mock).mockResolvedValue(true);

    const result = await findOrCreateDirectThread(TENANT_ID, PM_ID, ORG_ID, PROPERTY_ID);

    expect(result).not.toBeNull();
    expect(hasPMAccess).toHaveBeenCalledWith(expect.anything(), PROPERTY_ID, 'MESSAGE_TENANT');
  });

  describe('PM-to-landlord chat (Ticket 13, 2026-07-21)', () => {
    const landlordUser = {
      _id: new mongoose.Types.ObjectId(),
      role: 'LANDLORD',
      email: 'landlord@test.com',
      profile: { firstName: 'Larry', lastName: 'Landlord' },
    };

    beforeEach(() => {
      (User.find as jest.Mock).mockReturnValue(leanChain([pmUser, landlordUser]));
    });

    it('blocks a PM from starting a landlord chat without a propertyId', async () => {
      const result = await findOrCreateDirectThread(PM_ID, landlordUser._id.toString(), ORG_ID);

      expect(result).toBeNull();
      expect(hasPMAccess).not.toHaveBeenCalled();
      expect(ConversationModel.create).not.toHaveBeenCalled();
    });

    it('blocks a PM without MESSAGE_LANDLORD permission on the property', async () => {
      (hasPMAccess as jest.Mock).mockResolvedValue(false);

      const result = await findOrCreateDirectThread(PM_ID, landlordUser._id.toString(), ORG_ID, PROPERTY_ID);

      expect(result).toBeNull();
      expect(hasPMAccess).toHaveBeenCalledWith(expect.anything(), PROPERTY_ID, 'MESSAGE_LANDLORD');
      expect(ConversationModel.create).not.toHaveBeenCalled();
    });

    it('allows a PM with MESSAGE_LANDLORD permission to start the chat', async () => {
      (hasPMAccess as jest.Mock).mockResolvedValue(true);

      const result = await findOrCreateDirectThread(PM_ID, landlordUser._id.toString(), ORG_ID, PROPERTY_ID);

      expect(result).toEqual({ threadId: expect.any(String), isNew: true });
      expect(ConversationModel.create).toHaveBeenCalled();
    });
  });
});
