import mongoose, { Schema, Document } from 'mongoose';

export interface ChatSession extends Document {
  session_id: string;
  persona: string;
  route_summary: string;
  message_count: number;
  createdAt: Date;
  updatedAt: Date;
}

const ChatSessionSchema = new Schema<ChatSession>(
  {
    session_id: { type: String, required: true, unique: true, index: true },
    persona: { type: String, required: true},
    route_summary: { type: String, required: true },
    message_count: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

export const ChatSessionModel = mongoose.model<ChatSession>('ChatSession', ChatSessionSchema);

