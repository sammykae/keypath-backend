import mongoose, { Schema, Document } from 'mongoose';

export interface ChatExchange extends Document {
    session_id: string;
    role: "user" | "assistant";
    text: string;
    createdAt: Date;
}

const ChatExchangeSchema = new Schema<ChatExchange>(
  {
    session_id: { type: String, required: true, index: true },
    role: { 
      type: String, 
      required: true,  
      enum: ['user', 'assistant']
    },
    text: { type: String, required: true },
  },
  { timestamps: true }
);

export const ChatExchangeModel = mongoose.model<ChatExchange>('ChatExchange', ChatExchangeSchema);
