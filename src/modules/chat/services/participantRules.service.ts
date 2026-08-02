import mongoose from 'mongoose';
import { ConversationModel, ConversationDocument } from '../models/conversationModel';
import { User } from '../../auth/models/user.model';
import { Membership } from '../../orgs/models/membership.model';
import { Organization } from '../../orgs/models/organization.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { UnitModel } from '../../units/models/unit.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { logger } from '../../../core/logger';
import {
  ChatParticipantRole,
  ParticipantAccessResult,
  ConversationFilterOptions,
} from '../types/chat.types';

const roleToChatRole = (role: string): ChatParticipantRole => {
  const r = role?.toLowerCase();
  if (r === 'tenant') return 'tenant';
  if (r === 'landlord') return 'landlord';
  if (r === 'community' || r === 'community_stakeholder') return 'community';
  if (r === 'investor') return 'investor';
  if (r === 'admin') return 'admin';
  if (r === 'property_manager') return 'property_manager';
  return 'tenant';
};

export async function resolveOrgIdForUser(userId: string): Promise<mongoose.Types.ObjectId | null> {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return null;
  try {
    const id = new mongoose.Types.ObjectId(userId);
    const user = await User.findById(userId).lean();
    if (!user) return null;
    const role = user.role?.toLowerCase();

    if (role === 'tenant') {
      const tenancy = await TenancyModel.findOne({ tenantUserId: id, status: 'ACTIVE' }).lean();
      if (!tenancy) return null;
      const unit = await UnitModel.findById(tenancy.unitId).lean();
      if (!unit) return null;
      const property = await PropertyModel.findById(unit.propertyId).lean();
      return property?.orgId ?? null;
    }

    if (
      role === 'landlord' || role === 'admin' || role === 'community' ||
      role === 'community_stakeholder' || role === 'investor' || role === 'property_manager'
    ) {
      const membership = await Membership.findOne({ userId: id, status: 'active' }).lean();
      return membership?.orgId ?? null;
    }

    return null;
  } catch {
    return null;
  }
}

export const canAccessConversation = async (
  userId: string,
  conversationId: string
): Promise<ParticipantAccessResult> => {
  try {
    const user = await User.findById(userId).lean();
    if (!user) {
      return { hasAccess: false, reason: 'User not found' };
    }

    const conversation = await ConversationModel.findById(conversationId).lean();
    if (!conversation) {
      return { hasAccess: false, reason: 'Conversation not found' };
    }

    const role = roleToChatRole(user.role);
    if (role === 'admin') {
      return { hasAccess: true };
    }

    const isParticipant = conversation.participants.some(
      (p) => p.userId.toString() === userId && !p.leftAt
    );

    if (!isParticipant) {
      return { hasAccess: false, reason: 'User is not a participant in this conversation' };
    }

    const userOrgId = await resolveOrgIdForUser(userId);
    if (!userOrgId) {
      return { hasAccess: false, reason: 'User organization could not be resolved' };
    }
    if (conversation.orgId.toString() !== userOrgId.toString()) {
      return {
        hasAccess: false,
        reason: 'User can only access conversations in their organization',
      };
    }

    return { hasAccess: true };
  } catch (error) {
    logger.error({ error, userId, conversationId }, 'Error checking conversation access');
    return { hasAccess: false, reason: 'Error checking access' };
  }
};

export const canSendMessage = async (
  userId: string,
  conversationId: string
): Promise<ParticipantAccessResult> => {
  const accessResult = await canAccessConversation(userId, conversationId);
  if (!accessResult.hasAccess) {
    return accessResult;
  }

  return { hasAccess: true };
};

export const getAccessibleConversations = async (
  options: ConversationFilterOptions
): Promise<mongoose.FilterQuery<ConversationDocument>> => {
  const { userId, orgId, role } = options;

  const baseFilter: mongoose.FilterQuery<ConversationDocument> = {
    'participants.userId': new mongoose.Types.ObjectId(userId),
    'participants.leftAt': { $eq: null },
  };

  const chatRole = typeof role === 'string' ? roleToChatRole(role) : role;
  if (chatRole === 'admin') {
    return baseFilter;
  }
  if (!orgId || typeof orgId !== 'string' || !mongoose.Types.ObjectId.isValid(orgId)) {
    return { _id: { $in: [] } };
  }

  return {
    ...baseFilter,
    orgId: new mongoose.Types.ObjectId(orgId),
  };
};

export const canCreateConversation = async (
  creatorUserId: string,
  participantUserIds: string[],
  orgId: string
): Promise<ParticipantAccessResult> => {
  try {
    const creator = await User.findById(creatorUserId).lean();
    if (!creator) {
      return { hasAccess: false, reason: 'Creator user not found' };
    }

    const creatorOrgId = await resolveOrgIdForUser(creatorUserId);
    if (creatorOrgId && roleToChatRole(creator.role) !== 'admin') {
      if (creatorOrgId.toString() !== orgId) {
        return {
          hasAccess: false,
          reason: 'Cannot create conversation outside your organization',
        };
      }
    }

    const participants = await User.find({
      _id: { $in: participantUserIds.map((id) => new mongoose.Types.ObjectId(id)) },
    }).lean();

    // Landlord direct-chat toggle: a tenant may only start a chat that includes a
    // landlord if the landlord org has allowDirectTenantMessaging enabled.
    if (roleToChatRole(creator.role) === 'tenant') {
      const includesLandlord = participants.some((p) => roleToChatRole(p.role) === 'landlord');
      if (includesLandlord) {
        const org = await Organization.findById(orgId).lean();
        const allowed = org?.settings?.allowDirectTenantMessaging ?? true;
        if (!allowed) {
          return {
            hasAccess: false,
            reason: 'Direct tenant-to-landlord messaging is disabled by the landlord',
          };
        }
      }
    }

    for (const participant of participants) {
      if (roleToChatRole(participant.role) !== 'admin') {
        const pOrgId = await resolveOrgIdForUser(participant._id.toString());
        if (!pOrgId || pOrgId.toString() !== orgId) {
          return {
            hasAccess: false,
            reason: `Participant ${participant.email} is not in the target organization`,
          };
        }
      }
    }

    return { hasAccess: true };
  } catch (error) {
    logger.error({ error, creatorUserId, orgId }, 'Error checking conversation creation access');
    return { hasAccess: false, reason: 'Error checking access' };
  }
};

export const canAddParticipant = async (
  actorUserId: string,
  conversationId: string,
  newParticipantUserId: string
): Promise<ParticipantAccessResult> => {
  try {
    const actorAccess = await canAccessConversation(actorUserId, conversationId);
    if (!actorAccess.hasAccess) {
      return actorAccess;
    }

    const [actor, conversation, newParticipant] = await Promise.all([
      User.findById(actorUserId).lean(),
      ConversationModel.findById(conversationId).lean(),
      User.findById(newParticipantUserId).lean(),
    ]);

    if (!actor || !conversation || !newParticipant) {
      return { hasAccess: false, reason: 'User or conversation not found' };
    }

    if (roleToChatRole(actor.role) === 'tenant') {
      return {
        hasAccess: false,
        reason: 'Tenants cannot add participants to conversations',
      };
    }

    const newParticipantOrgId = await resolveOrgIdForUser(newParticipantUserId);
    if (
      roleToChatRole(newParticipant.role) !== 'admin' &&
      (!newParticipantOrgId || newParticipantOrgId.toString() !== conversation.orgId.toString())
    ) {
      return {
        hasAccess: false,
        reason: 'Cannot add participant from different organization',
      };
    }

    return { hasAccess: true };
  } catch (error) {
    logger.error({ error, actorUserId, conversationId, newParticipantUserId }, 'Error checking add participant access');
    return { hasAccess: false, reason: 'Error checking access' };
  }
};

export const validateTenantAccess = async (
  tenantUserId: string,
  conversationOrgId: string
): Promise<boolean> => {
  const tenant = await User.findById(tenantUserId).lean();
  if (!tenant || roleToChatRole(tenant.role) !== 'tenant') {
    return false;
  }
  const orgId = await resolveOrgIdForUser(tenantUserId);
  return orgId !== null && orgId.toString() === conversationOrgId;
};

export const validateLandlordAccess = async (
  landlordUserId: string,
  conversationOrgId: string
): Promise<boolean> => {
  const landlord = await User.findById(landlordUserId).lean();
  if (!landlord || roleToChatRole(landlord.role) !== 'landlord') {
    return false;
  }
  const orgId = await resolveOrgIdForUser(landlordUserId);
  return orgId !== null && orgId.toString() === conversationOrgId;
};