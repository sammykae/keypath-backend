import mongoose, { Schema, Document } from 'mongoose';

export interface INotificationRead extends Document {
  userId: mongoose.Types.ObjectId;
  lastReadAt: Date;
}

const schema = new Schema<INotificationRead>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    lastReadAt: { type: Date, required: true, default: Date.now },
  },
  { collection: 'notification_reads', timestamps: false }
);

export const NotificationReadModel = mongoose.model<INotificationRead>('NotificationRead', schema);
