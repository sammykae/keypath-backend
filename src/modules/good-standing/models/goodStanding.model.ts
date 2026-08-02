import mongoose, { Schema, Document } from 'mongoose';

export type GoodStandingStatus = 'ACTIVE' | 'AT_RISK' | 'PAUSED' | 'SUSPENDED';

export type StandingFlagType =
  | 'EVICTION'
  | 'LEASE_VIOLATION'
  | 'DAMAGE_CLAIM'
  | 'UNAUTHORIZED_OCCUPANT'
  | 'FRAUD'
  | 'OTHER';

export const STANDING_FLAG_TYPES: StandingFlagType[] = [
  'EVICTION', 'LEASE_VIOLATION', 'DAMAGE_CLAIM', 'UNAUTHORIZED_OCCUPANT', 'FRAUD', 'OTHER',
];

/**
 * Auto-compute thresholds (days of rent arrears). Proposed defaults pending
 * Laurel's confirmation — tune here, everything downstream follows.
 */
export const GOOD_STANDING_THRESHOLDS = {
  atRiskDaysLate: 1,      // 1-30 days late  -> AT_RISK
  pausedDaysLate: 31,     // 31-90 days late -> PAUSED
  suspendedDaysLate: 91,  // 91+ days late   -> SUSPENDED
};

/** Statuses that pause reward + token eligibility (per Laurel: downgrade pauses eligibility). */
export const ELIGIBILITY_BLOCKING_STATUSES: GoodStandingStatus[] = ['PAUSED', 'SUSPENDED'];

/** Severity each landlord flag maps to during auto-compute. */
export const FLAG_SEVERITY: Record<StandingFlagType, GoodStandingStatus> = {
  EVICTION: 'SUSPENDED',
  FRAUD: 'SUSPENDED',
  LEASE_VIOLATION: 'PAUSED',
  DAMAGE_CLAIM: 'AT_RISK',
  UNAUTHORIZED_OCCUPANT: 'AT_RISK',
  OTHER: 'AT_RISK',
};

export const STATUS_RANK: Record<GoodStandingStatus, number> = {
  ACTIVE: 0,
  AT_RISK: 1,
  PAUSED: 2,
  SUSPENDED: 3,
};

export interface IStandingFlag {
  _id: mongoose.Types.ObjectId;
  type: StandingFlagType;
  note: string;
  flaggedBy: mongoose.Types.ObjectId;
  flaggedAt: Date;
  resolvedAt?: Date | null;
  resolvedBy?: mongoose.Types.ObjectId | null;
}

export interface IStandingOverride {
  status: GoodStandingStatus;
  reason: string;
  setBy: mongoose.Types.ObjectId;
  setAt: Date;
}

export interface ITenantGoodStanding extends Document {
  _id: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  tenantUserId: mongoose.Types.ObjectId;
  tenancyId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  flags: IStandingFlag[];
  /** Admin override — when set, it wins over the auto-computed status. */
  override?: IStandingOverride | null;
  createdAt: Date;
  updatedAt: Date;
}

const flagSchema = new Schema<IStandingFlag>(
  {
    type: { type: String, enum: STANDING_FLAG_TYPES, required: true },
    note: { type: String, required: true, trim: true, maxlength: 1000 },
    flaggedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    flaggedAt: { type: Date, required: true, default: Date.now },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: true }
);

const schema = new Schema<ITenantGoodStanding>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    tenantUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tenancyId: { type: Schema.Types.ObjectId, ref: 'Tenancy', required: true, unique: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    flags: { type: [flagSchema], default: [] },
    override: {
      type: {
        status: { type: String, enum: ['ACTIVE', 'AT_RISK', 'PAUSED', 'SUSPENDED'], required: true },
        reason: { type: String, required: true },
        setBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        setAt: { type: Date, required: true },
      },
      default: null,
    },
  },
  { timestamps: true, collection: 'tenant_good_standing' }
);

schema.index({ orgId: 1, tenantUserId: 1 });

export const TenantGoodStandingModel = mongoose.model<ITenantGoodStanding>(
  'TenantGoodStanding',
  schema
);
