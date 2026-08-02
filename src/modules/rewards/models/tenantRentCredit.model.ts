import mongoose, { Schema, Document } from 'mongoose';

export type RentCreditStatus = 'PENDING' | 'APPLIED' | 'CANCELLED';

export interface ITenantRentCredit extends Document {
  _id: mongoose.Types.ObjectId;
  tenantUserId: mongoose.Types.ObjectId;
  redemptionId: mongoose.Types.ObjectId;
  amount: number;
  status: RentCreditStatus;
  appliedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ITenantRentCredit>(
  {
    tenantUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    redemptionId: { type: Schema.Types.ObjectId, ref: 'Redemption', required: true, index: true },
    amount:       { type: Number, required: true, min: 0 },
    status:       { type: String, enum: ['PENDING', 'APPLIED', 'CANCELLED'], default: 'PENDING', index: true },
    appliedAt:    { type: Date },
  },
  { timestamps: true, collection: 'tenantRentCredits' }
);

schema.index({ tenantUserId: 1, status: 1 });

export const TenantRentCreditModel = mongoose.model<ITenantRentCredit>('TenantRentCredit', schema);
