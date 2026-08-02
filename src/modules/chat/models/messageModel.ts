import mongoose, { Schema, Document } from 'mongoose';
import { IMessage, MessageAttachment } from '../types/chat.types';

export interface MessageDocument extends Omit<IMessage, '_id'>, Document {
  _id: mongoose.Types.ObjectId;
}

const attachmentSchema = new Schema<MessageAttachment>(
  {
    id: {
      type: String,
      required: true,
    },
    fileName: {
      type: String,
      required: true,
      maxlength: 255,
    },
    fileType: {
      type: String,
      required: true,
      maxlength: 100,
    },
    fileSize: {
      type: Number,
      required: true,
      min: 0,
    },
    url: {
      type: String,
      required: true,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const messageSchema = new Schema<MessageDocument>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    senderUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    body: {
      type: String,
      required: true,
      maxlength: 10000,
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
    readBy: {
      type: [Schema.Types.ObjectId],
      ref: 'User',
      default: [],
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, senderUserId: 1 });
messageSchema.index({ senderUserId: 1, createdAt: -1 });

messageSchema.virtual('isDeleted').get(function () {
  return !!this.deletedAt;
});

messageSchema.methods.markAsRead = function (userId: mongoose.Types.ObjectId): void {
  if (!this.readBy.some((id: mongoose.Types.ObjectId) => id.toString() === userId.toString())) {
    this.readBy.push(userId);
  }
};

messageSchema.methods.softDelete = function (): void {
  this.deletedAt = new Date();
};

messageSchema.statics.getUnreadCount = async function (
  conversationId: string,
  userId: string
): Promise<number> {
  return this.countDocuments({
    conversationId: new mongoose.Types.ObjectId(conversationId),
    readBy: { $ne: new mongoose.Types.ObjectId(userId) },
    senderUserId: { $ne: new mongoose.Types.ObjectId(userId) },
    deletedAt: null,
  });
};

export const MessageModel = mongoose.model<MessageDocument>('Message', messageSchema);
