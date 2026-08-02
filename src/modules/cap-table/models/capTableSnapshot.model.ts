import mongoose, { Schema, Document } from 'mongoose';
import type { CapTableAllocation, CapTableTenantBreakdown, CapTableIssue } from '../types/capTable.types';

export interface CapTableSnapshot extends Document {
  orgId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  totalTokens: number;
  ledgerTotalTokens: number;
  allocations: CapTableAllocation[];
  tenantBreakdown: CapTableTenantBreakdown[];
  ownershipPctSum: number;
  consistency: 'OK' | 'MISMATCH';
  tableErrors: CapTableIssue[];
  tableWarnings: CapTableIssue[];
  computedAt: Date;
}

const allocationSchema = new Schema(
  {
    role: { type: String, enum: ['landlord', 'tenant', 'investor'], required: true },
    tokens: { type: Number, required: true },
    ownershipPct: { type: Number, required: true },
    entityId: { type: String },
  },
  { _id: false }
);

const tenantBreakSchema = new Schema(
  {
    entityId: { type: String, required: true },
    tokens: { type: Number, required: true },
    ownershipPct: { type: Number, required: true },
  },
  { _id: false }
);

const issueSchema = new Schema(
  {
    code: { type: String, required: true },
    message: { type: String, required: true },
  },
  { _id: false }
);

const capTableSnapshotSchema = new Schema<CapTableSnapshot>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, unique: true, index: true },
    totalTokens: { type: Number, required: true },
    ledgerTotalTokens: { type: Number, required: true },
    allocations: { type: [allocationSchema], required: true },
    tenantBreakdown: { type: [tenantBreakSchema], default: [] },
    ownershipPctSum: { type: Number, required: true },
    consistency: { type: String, enum: ['OK', 'MISMATCH'], required: true },
    tableErrors: { type: [issueSchema], default: [] },
    tableWarnings: { type: [issueSchema], default: [] },
    computedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: false }
);

export const CapTableSnapshotModel = mongoose.model<CapTableSnapshot>(
  'CapTableSnapshot',
  capTableSnapshotSchema
);
