import mongoose, { Schema, Document } from 'mongoose';

export type FulfillmentType = 'GIFT_CARD' | 'RENT_CREDIT' | 'SERVICE';
export type FulfillmentStatus = 'PENDING' | 'DELIVERED' | 'APPLIED' | 'CANCELLED';
export type ApprovalStatus = 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface IFulfillment {
  type: FulfillmentType;
  status: FulfillmentStatus;
  code?: string;
  creditAmount?: number;
  serviceType?: string;
  fulfilledAt?: Date;
}

export interface IRedemption extends Document {
  _id: mongoose.Types.ObjectId;
  rewardId: mongoose.Types.ObjectId;
  accountId: mongoose.Types.ObjectId;
  tenantUserId: mongoose.Types.ObjectId;
  amount: number;
  idempotencyKey: string;
  approvalStatus: ApprovalStatus;
  approvedBy?: mongoose.Types.ObjectId | null;
  approvedAt?: Date | null;
  rejectedBy?: mongoose.Types.ObjectId | null;
  rejectionReason?: string | null;
  scheduledAt?: Date | null;
  fulfilledBy?: mongoose.Types.ObjectId | null;
  fulfillment?: IFulfillment;
  createdAt: Date;
}

const fulfillmentSchema = new Schema<IFulfillment>(
  {
    type:         { type: String, enum: ['GIFT_CARD', 'RENT_CREDIT', 'SERVICE'], required: true },
    status:       { type: String, enum: ['PENDING', 'DELIVERED', 'APPLIED', 'CANCELLED'], default: 'PENDING' },
    code:         { type: String },
    creditAmount: { type: Number },
    serviceType:  { type: String },
    fulfilledAt:  { type: Date },
  },
  { _id: false }
);

const redemptionSchema = new Schema<IRedemption>(
  {
    rewardId:        { type: Schema.Types.ObjectId, ref: 'Reward', required: true, index: true },
    accountId:       { type: Schema.Types.ObjectId, ref: 'CreditAccount', required: true, index: true },
    tenantUserId:    { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount:          { type: Number, required: true, min: 0 },
    idempotencyKey:  { type: String, required: true, unique: true },
    approvalStatus:  {
      type: String,
      enum: ['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED'],
      default: 'NOT_REQUIRED',
      index: true,
    },
    approvedBy:      { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt:      { type: Date, default: null },
    rejectedBy:      { type: Schema.Types.ObjectId, ref: 'User', default: null },
    rejectionReason: { type: String, default: null },
    scheduledAt:     { type: Date, default: null },
    fulfilledBy:     { type: Schema.Types.ObjectId, ref: 'User', default: null },
    fulfillment:     { type: fulfillmentSchema },
  },
  { timestamps: true }
);

export const RedemptionModel = mongoose.model<IRedemption>('Redemption', redemptionSchema);
