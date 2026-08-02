import mongoose, { Schema, Document } from 'mongoose';

/**
 * TEPA liquidity workflow (Laurel, Q2): record-and-track only for MVP.
 * No on-platform money movement — the platform tracks request status, audit
 * history, vested token payment rights, approved deductions, transfer status,
 * and the landlord's right of first refusal (ROFR). Actual payouts happen
 * off-platform once transferStatus reaches COMPLETED.
 */

export type LiquidityStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'DENIED'
  | 'CANCELLED'
  | 'COMPLETED';

export type RofrDecision = 'PENDING' | 'WAIVED' | 'EXERCISED';

export type TransferStatus = 'NOT_STARTED' | 'PENDING' | 'COMPLETED';

export const LIQUIDITY_STATUSES: LiquidityStatus[] = [
  'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'DENIED', 'CANCELLED', 'COMPLETED',
];

/** Landlord's window to exercise ROFR before it lapses (proposed default, pending Laurel confirmation). */
export const DEFAULT_ROFR_RESPONSE_DAYS = 30;

/** Statuses a tenant may still cancel from. */
export const CANCELLABLE_STATUSES: LiquidityStatus[] = ['SUBMITTED', 'UNDER_REVIEW'];

export interface IDeduction {
  _id: mongoose.Types.ObjectId;
  amountTokens: number;
  reason: string;
  approvedBy: mongoose.Types.ObjectId;
  approvedAt: Date;
}

export interface ILiquidityRequest extends Document {
  _id: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  tenantUserId: mongoose.Types.ObjectId;
  tenancyId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;

  requestedTokens: number;
  /** Snapshot of the tenant's vested token balance at submission time. */
  vestedTokensAtRequest: number;

  status: LiquidityStatus;
  statusHistory: { status: LiquidityStatus; changedBy: mongoose.Types.ObjectId; changedAt: Date; note?: string }[];

  deductions: IDeduction[];

  rofrDecision: RofrDecision;
  rofrResponseDeadline?: Date | null;
  rofrDecidedBy?: mongoose.Types.ObjectId | null;
  rofrDecidedAt?: Date | null;
  rofrNote?: string | null;

  transferStatus: TransferStatus;
  transferCompletedAt?: Date | null;
  transferNote?: string | null;

  submittedAt: Date;
  reviewedBy?: mongoose.Types.ObjectId | null;
  reviewedAt?: Date | null;
  reviewNote?: string | null;

  createdAt: Date;
  updatedAt: Date;
}

const deductionSchema = new Schema<IDeduction>(
  {
    amountTokens: { type: Number, required: true, min: 0 },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    approvedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: true }
);

const statusHistorySchema = new Schema(
  {
    status: { type: String, enum: LIQUIDITY_STATUSES, required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    changedAt: { type: Date, required: true, default: Date.now },
    note: { type: String, maxlength: 1000 },
  },
  { _id: false }
);

const schema = new Schema<ILiquidityRequest>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    tenantUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tenancyId: { type: Schema.Types.ObjectId, ref: 'Tenancy', required: true, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },

    requestedTokens: { type: Number, required: true, min: 0 },
    vestedTokensAtRequest: { type: Number, required: true, min: 0 },

    status: { type: String, enum: LIQUIDITY_STATUSES, default: 'SUBMITTED', index: true },
    statusHistory: { type: [statusHistorySchema], default: [] },

    deductions: { type: [deductionSchema], default: [] },

    rofrDecision: { type: String, enum: ['PENDING', 'WAIVED', 'EXERCISED'], default: 'PENDING' },
    rofrResponseDeadline: { type: Date, default: null },
    rofrDecidedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    rofrDecidedAt: { type: Date, default: null },
    rofrNote: { type: String, default: null, maxlength: 1000 },

    transferStatus: { type: String, enum: ['NOT_STARTED', 'PENDING', 'COMPLETED'], default: 'NOT_STARTED' },
    transferCompletedAt: { type: Date, default: null },
    transferNote: { type: String, default: null, maxlength: 1000 },

    submittedAt: { type: Date, required: true, default: Date.now },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: null, maxlength: 1000 },
  },
  { timestamps: true, collection: 'liquidity_requests' }
);

schema.index({ orgId: 1, status: 1, createdAt: -1 });
schema.index({ tenantUserId: 1, createdAt: -1 });

export const LiquidityRequestModel = mongoose.model<ILiquidityRequest>(
  'LiquidityRequest',
  schema
);
