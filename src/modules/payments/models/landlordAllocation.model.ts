import mongoose, { Schema, Document } from 'mongoose';

export interface ILandlordAllocation extends Document {
  _id: mongoose.Types.ObjectId;
  paymentId: mongoose.Types.ObjectId;
  tenantUserId: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  unitId: mongoose.Types.ObjectId;
  period: string;
  grossAmount: number;
  platformFee: number;
  netAmount: number;
  currency: string;
  status: 'PENDING' | 'SETTLED';
  settledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const landlordAllocationSchema = new Schema<ILandlordAllocation>(
  {
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true, unique: true },
    tenantUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true },
    period: { type: String, required: true, index: true },
    grossAmount: { type: Number, required: true, min: 0 },
    platformFee: { type: Number, required: true, min: 0 },
    netAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: 'usd' },
    status: { type: String, enum: ['PENDING', 'SETTLED'], default: 'PENDING', index: true },
    settledAt: { type: Date },
  },
  { timestamps: true }
);

landlordAllocationSchema.index({ orgId: 1, period: 1 });
landlordAllocationSchema.index({ orgId: 1, status: 1 });

export const LandlordAllocationModel = mongoose.model<ILandlordAllocation>(
  'LandlordAllocation',
  landlordAllocationSchema
);
