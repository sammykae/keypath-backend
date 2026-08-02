import mongoose from 'mongoose';

export type ChatParticipantRole = 'tenant' | 'landlord' | 'community' | 'investor' | 'admin' | 'property_manager';

export interface Participant {
  userId: mongoose.Types.ObjectId;
  role: ChatParticipantRole;
  joinedAt: Date;
  leftAt?: Date;
}

export interface IConversation {
  _id: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  participants: Participant[];
  title?: string;
  type: 'direct' | 'group' | 'support';
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt?: Date;
  propertyId?: mongoose.Types.ObjectId;
}

export interface MessageAttachment {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  url: string;
  uploadedAt: Date;
}

export interface IMessage {
  _id: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  senderUserId: mongoose.Types.ObjectId;
  body: string;
  attachments?: MessageAttachment[];
  readBy?: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface ParticipantAccessResult {
  hasAccess: boolean;
  reason?: string;
}

export interface ConversationFilterOptions {
  userId: string;
  orgId: string;
  role: ChatParticipantRole;
}
