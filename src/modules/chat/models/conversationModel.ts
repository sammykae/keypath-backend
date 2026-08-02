import mongoose, { Schema, Document } from 'mongoose';
import { IConversation, Participant } from '../types/chat.types';

export interface ConversationDocument extends Omit<IConversation, '_id'>, Document {
  _id: mongoose.Types.ObjectId;
}

const participantSchema = new Schema<Participant>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: ['tenant', 'landlord', 'community', 'investor', 'admin', 'property_manager'],
      required: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    leftAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const conversationSchema = new Schema<ConversationDocument>(
  {
    orgId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    participants: {
      type: [participantSchema],
      required: true,
      validate: {
        validator: function (v: Participant[]) {
          return v.length >= 1;
        },
        message: 'Conversation must have at least one participant',
      },
    },
    title: {
      type: String,
      maxlength: 255,
      default: null,
    },
    type: {
      type: String,
      enum: ['direct', 'group', 'support'],
      default: 'direct',
    },
    lastMessageAt: {
      type: Date,
      default: null,
    },
    propertyId: {
      type: Schema.Types.ObjectId,
      ref: 'Property',
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

conversationSchema.index({ orgId: 1, 'participants.userId': 1 });
conversationSchema.index({ 'participants.userId': 1 });
conversationSchema.index({ lastMessageAt: -1 });
conversationSchema.index({ orgId: 1, createdAt: -1 });

conversationSchema.virtual('activeParticipants').get(function () {
  return this.participants.filter((p) => !p.leftAt);
});

conversationSchema.methods.isParticipant = function (userId: string): boolean {
  return this.participants.some(
    (p: Participant) => p.userId.toString() === userId && !p.leftAt
  );
};

conversationSchema.methods.addParticipant = function (
  userId: mongoose.Types.ObjectId,
  role: string
): void {
  const existingParticipant = this.participants.find(
    (p: Participant) => p.userId.toString() === userId.toString()
  );

  if (existingParticipant) {
    existingParticipant.leftAt = undefined;
    existingParticipant.joinedAt = new Date();
  } else {
    this.participants.push({
      userId,
      role,
      joinedAt: new Date(),
    });
  }
};

conversationSchema.methods.removeParticipant = function (userId: string): void {
  const participant = this.participants.find(
    (p: Participant) => p.userId.toString() === userId
  );
  if (participant) {
    participant.leftAt = new Date();
  }
};

export const ConversationModel = mongoose.model<ConversationDocument>(
  'Conversation',
  conversationSchema
);
