import mongoose, { Schema, Document } from 'mongoose';

export type PaymentStatus = 'DUE' | 'PAID' | 'LATE' | 'FAILED' | 'REFUNDED';
export type PaymentType = 'RENT' | 'TOKEN_PURCHASE';

export interface IPayment extends Document {
  _id: mongoose.Types.ObjectId;
  tenantUserId: mongoose.Types.ObjectId;
  unitId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  tenancyId?: mongoose.Types.ObjectId;
  period: string; // YYYY-MM e.g. "2025-10"
  amount: number;
  type: PaymentType;
  status: PaymentStatus;
  stripePaymentIntentId?: string;
  dueDate: Date;
  paidAt?: Date;
  refundedAt?: Date;
  refundAmount?: number;
  method?: string;
  incentivesEarnedCredits?: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    tenantUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    unitId: {
      type: Schema.Types.ObjectId,
      ref: 'Unit',
      required: true,
      index: true,
    },
    propertyId: {
      type: Schema.Types.ObjectId,
      ref: 'Property',
      required: true,
      index: true,
    },
    orgId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    tenancyId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenancy',
      index: true,
    },
    period: { type: String, required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    type: {
      type: String,
      enum: ['RENT', 'TOKEN_PURCHASE'],
      required: true,
      default: 'RENT',
      index: true,
    },
    status: {
      type: String,
      enum: ['DUE', 'PAID', 'LATE', 'FAILED', 'REFUNDED'],
      required: true,
      default: 'DUE',
      index: true,
    },
    stripePaymentIntentId: { type: String, index: true, sparse: true },
    dueDate: { type: Date, required: true, index: true },
    paidAt: { type: Date },
    refundedAt: { type: Date },
    refundAmount: { type: Number, min: 0 },
    method: { type: String },
    incentivesEarnedCredits: { type: Number, min: 0 },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

paymentSchema.index({ tenantUserId: 1, dueDate: -1 });
paymentSchema.index({ tenancyId: 1, period: 1, type: 1 }, { unique: true, sparse: true });
paymentSchema.index({ orgId: 1, status: 1 });
paymentSchema.index({ orgId: 1, period: 1 });

export const PaymentModel = mongoose.model<IPayment>('Payment', paymentSchema);
