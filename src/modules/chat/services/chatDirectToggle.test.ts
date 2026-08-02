import mongoose from 'mongoose';
import { findOrCreateDirectThread } from './chat.service';
import { ConversationModel } from '../models/conversationModel';
import { User } from '../../auth/models/user.model';
import { Organization } from '../../orgs/models/organization.model';

const ORG_ID = '507f1f77bcf86cd7994390aa';
const TENANT_ID = '507f1f77bcf86cd799439001';
const LANDLORD_ID = '507f1f77bcf86cd799439002';

jest.mock('../../../core/socket/socketServer', () => ({
  emitToThread: jest.fn(),
  emitToUser: jest.fn(),
}));

jest.mock('../models/conversationModel', () => ({
  ConversationModel: {
    findOne: jest.fn(),
    create: jest.fn(),
  },
}));

jest.mock('../models/messageModel', () => ({
  MessageModel: {},
}));

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

function leanChain<T>(value: T) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

const tenantUser = {
  _id: new mongoose.Types.ObjectId(TENANT_ID),
  role: 'TENANT',
  email: 'tenant@test.com',
  profile: { firstName: 'Tina', lastName: 'Tenant' },
};
const landlordUser = {
  _id: new mongoose.Types.ObjectId(LANDLORD_ID),
  role: 'LANDLORD',
  email: 'landlord@test.com',
  profile: { firstName: 'Larry', lastName: 'Landlord' },
};

describe('findOrCreateDirectThread — landlord direct-chat toggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // No existing thread — force the create path
    (ConversationModel.findOne as jest.Mock).mockReturnValue(leanChain(null));
    (User.find as jest.Mock).mockReturnValue(leanChain([tenantUser, landlordUser]));
    (ConversationModel.create as jest.Mock).mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
    });
  });

  it('blocks a tenant from starting a landlord chat when the toggle is off', async () => {
    (Organization.findById as jest.Mock).mockReturnValue(
      leanChain({ settings: { allowDirectTenantMessaging: false } })
    );

    const result = await findOrCreateDirectThread(TENANT_ID, LANDLORD_ID, ORG_ID);

    expect(result).toBeNull();
    expect(ConversationModel.create).not.toHaveBeenCalled();
  });

  it('allows a tenant to start a landlord chat when the toggle is on', async () => {
    (Organization.findById as jest.Mock).mockReturnValue(
      leanChain({ settings: { allowDirectTenantMessaging: true } })
    );

    const result = await findOrCreateDirectThread(TENANT_ID, LANDLORD_ID, ORG_ID);

    expect(result).toEqual({ threadId: expect.any(String), isNew: true });
    expect(ConversationModel.create).toHaveBeenCalled();
  });

  it('defaults to allowed when the org has no settings (backward compatible)', async () => {
    (Organization.findById as jest.Mock).mockReturnValue(leanChain({}));

    const result = await findOrCreateDirectThread(TENANT_ID, LANDLORD_ID, ORG_ID);

    expect(result).not.toBeNull();
    expect(ConversationModel.create).toHaveBeenCalled();
  });

  it('does not gate landlord-initiated chats on the toggle', async () => {
    // Landlord starts the chat (userA = landlord) — toggle must not apply
    (Organization.findById as jest.Mock).mockReturnValue(
      leanChain({ settings: { allowDirectTenantMessaging: false } })
    );
    (User.find as jest.Mock).mockReturnValue(leanChain([landlordUser, tenantUser]));

    const result = await findOrCreateDirectThread(LANDLORD_ID, TENANT_ID, ORG_ID);

    expect(result).not.toBeNull();
    expect(ConversationModel.create).toHaveBeenCalled();
  });
});
