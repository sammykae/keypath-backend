import mongoose, { Schema, Document } from 'mongoose';

export interface IStripeWebhookEvent extends Document {
  eventId: string;
  eventType: string;
  paymentIntentId?: string;
  status: 'PROCESSING' | 'PROCESSED' | 'FAILED';
  attempts: number;
  lastError?: string;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const stripeWebhookEventSchema = new Schema<IStripeWebhookEvent>(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    eventType: { type: String, required: true },
    paymentIntentId: { type: String, index: true },
    status: { type: String, enum: ['PROCESSING', 'PROCESSED', 'FAILED'], default: 'PROCESSING', index: true },
    attempts: { type: Number, default: 1 },
    lastError: { type: String },
    processedAt: { type: Date },
  },
  { timestamps: true }
);

export const StripeWebhookEventModel = mongoose.model<IStripeWebhookEvent>(
  'StripeWebhookEvent',
  stripeWebhookEventSchema
);
