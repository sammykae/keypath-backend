export { ConversationModel, ConversationDocument } from './models/conversationModel';
export { MessageModel, MessageDocument } from './models/messageModel';

export type {
  IConversation,
  IMessage,
  Participant,
  MessageAttachment,
  ChatParticipantRole,
  ParticipantAccessResult,
  ConversationFilterOptions,
} from './types/chat.types';

export {
  canAccessConversation,
  canSendMessage,
  getAccessibleConversations,
  canCreateConversation,
  canAddParticipant,
  validateTenantAccess,
  validateLandlordAccess,
  resolveOrgIdForUser,
} from './services/participantRules.service';
