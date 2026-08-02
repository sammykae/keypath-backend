import mongoose, { Schema, Document } from 'mongoose';

export interface Tenancy extends Document {
  _id: mongoose.Types.ObjectId;
  tenantUserId: mongoose.Types.ObjectId;
  unitId: mongoose.Types.ObjectId;
  leaseStart: Date;
  leaseEnd: Date;
  rentAmount: number;
  status: 'PENDING' | 'ACTIVE' | 'ENDED' | 'TERMINATED';
  tepaOptInStatus?: 'OPTED_IN' | 'OPTED_OUT' | 'PENDING';
  createdAt: Date;
  updatedAt: Date;
}

const tenancySchema = new Schema<Tenancy>(
  {
    tenantUserId: { 
      type: Schema.Types.ObjectId, 
      ref: 'User', 
      required: true, 
      index: true 
    },
    unitId: { 
      type: Schema.Types.ObjectId, 
      ref: 'Unit', 
      required: true, 
      index: true 
    },
    leaseStart: { 
      type: Date, 
      required: true 
    },
    leaseEnd: { 
      type: Date, 
      required: true 
    },
    rentAmount: { 
      type: Number, 
      required: true, 
      min: 0 
    },
    status: {
      type: String,
      enum: ['PENDING', 'ACTIVE', 'ENDED', 'TERMINATED'],
      required: true,
      default: 'PENDING',
      index: true
    },
    tepaOptInStatus: {
      type: String,
      enum: ['OPTED_IN', 'OPTED_OUT', 'PENDING'],
      default: 'PENDING'
    }
  },
  { timestamps: true }
);

// Compound index to prevent duplicate active tenancies for the same unit
tenancySchema.index({ unitId: 1, status: 1 }, { 
  unique: true, 
  partialFilterExpression: { status: 'ACTIVE' } 
});

// Index for tenant lookups
tenancySchema.index({ tenantUserId: 1, status: 1 });
// Index for occupancy trend: unitId + status + lease date range queries
tenancySchema.index({ unitId: 1, status: 1, leaseStart: 1, leaseEnd: 1 });

export const TenancyModel = mongoose.model<Tenancy>('Tenancy', tenancySchema);
