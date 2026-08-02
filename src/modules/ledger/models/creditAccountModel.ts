import mongoose, { Schema, Document } from 'mongoose';

export interface CreditAccount extends Document {
  _id: mongoose.Types.ObjectId;
  tenantUserId: mongoose.Types.ObjectId;
  orgId?: mongoose.Types.ObjectId;
  unitId?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const creditAccountSchema = new Schema<CreditAccount>(
  {
    tenantUserId: { 
      type: Schema.Types.ObjectId, 
      ref: 'User', 
      required: true, 
      index: true 
    },
    orgId: { 
      type: Schema.Types.ObjectId, 
      ref: 'Organization', 
      index: true 
    },
    unitId: { 
      type: Schema.Types.ObjectId, 
      ref: 'Unit', 
      index: true 
    },
    createdAt: { 
      type: Date, 
      default: Date.now,
      required: true 
    }
  },
  { timestamps: false }
);

// Compound index for efficient account lookup
creditAccountSchema.index({ tenantUserId: 1, orgId: 1, unitId: 1 }, { unique: true });

export const CreditAccountModel = mongoose.model<CreditAccount>('CreditAccount', creditAccountSchema);
