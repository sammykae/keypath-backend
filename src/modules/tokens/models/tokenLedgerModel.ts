import mongoose, { Schema, Document } from 'mongoose';

export type TokenLedgerAllocationPool = 'LANDLORD' | 'TENANT' | 'INVESTOR';

export interface TokenLedger extends Document {
  _id: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  unitId?: mongoose.Types.ObjectId;
  tenantId?: mongoose.Types.ObjectId;
  /** When set and `tenantId` is absent, attributes ledger delta to landlord vs investor pool (BE-310). */
  allocationPool?: TokenLedgerAllocationPool;
  delta: number;
  reason: 'RENT_ACCRUAL' | 'BONUS' | 'CORRECTION' | 'REDEMPTION';
  ts: Date;
}

const tokenLedgerSchema = new Schema<TokenLedger>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', index: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', index: true },
    allocationPool: {
      type: String,
      enum: ['LANDLORD', 'TENANT', 'INVESTOR'],
      index: true,
    },
    delta: { type: Number, required: true },
    reason: { 
      type: String, 
      enum: ['RENT_ACCRUAL', 'BONUS', 'CORRECTION', 'REDEMPTION'], 
      required: true 
    },
    ts: { type: Date, required: true, default: Date.now, index: true }
  },
  { timestamps: false }
);

// Indexes as specified in guide
tokenLedgerSchema.index({ orgId: 1, propertyId: 1, ts: -1 });

export const TokenLedgerModel = mongoose.model<TokenLedger>('TokenLedger', tokenLedgerSchema);

