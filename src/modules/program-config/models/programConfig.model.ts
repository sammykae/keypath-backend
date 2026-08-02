import mongoose, { Schema, Document } from 'mongoose';

/**
 * Program configuration hierarchy (Laurel, 2026-07-06):
 *   Organization → Property → Unit → Tenant
 * Each level inherits from the level above unless a field is explicitly set.
 * MVP UI exposes property-level defaults + tenant-level overrides; ORG and
 * UNIT scopes are fully supported in the schema so mixed-income / specialized
 * housing programs can configure per-unit economics later without a redesign.
 */

export type ConfigScope = 'ORG' | 'PROPERTY' | 'UNIT' | 'TENANT';
export type ProgramType = 'NONE' | 'RPA_ONLY' | 'TEPA_ONLY' | 'BOTH';

export const CONFIG_SCOPES: ConfigScope[] = ['ORG', 'PROPERTY', 'UNIT', 'TENANT'];
export const PROGRAM_TYPES: ProgramType[] = ['NONE', 'RPA_ONLY', 'TEPA_ONLY', 'BOTH'];

/** RPA side — reward economics. All fields optional: unset = inherit. */
export interface IRewardRules {
  enabled?: boolean | null;
  onTimeRentPoints?: number | null;
  renewalPoints?: number | null;
  maintenanceReportPoints?: number | null;
  monthlyPointsCap?: number | null;
}

/** TEPA side — token economics. All fields optional: unset = inherit. */
export interface ITokenRules {
  enabled?: boolean | null;
  /** Tokens accrued per month of tenancy (Laurel: simple time-based vesting). */
  monthlyAccrualTokens?: number | null;
  /** Months an accrued token stays unvested before it vests. 0 = vests immediately. */
  vestingMonths?: number | null;
  tokenValueUsd?: number | null;
}

export interface IProgramConfig extends Document {
  _id: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  scope: ConfigScope;
  propertyId?: mongoose.Types.ObjectId | null; // PROPERTY / UNIT / TENANT
  unitId?: mongoose.Types.ObjectId | null;     // UNIT
  tenancyId?: mongoose.Types.ObjectId | null;  // TENANT
  /** null = inherit from parent scope */
  programType?: ProgramType | null;
  rewardRules?: IRewardRules | null;
  tokenRules?: ITokenRules | null;
  effectiveDate?: Date | null;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const rewardRulesSchema = new Schema<IRewardRules>(
  {
    enabled: { type: Boolean, default: undefined },
    onTimeRentPoints: { type: Number, min: 0, default: undefined },
    renewalPoints: { type: Number, min: 0, default: undefined },
    maintenanceReportPoints: { type: Number, min: 0, default: undefined },
    monthlyPointsCap: { type: Number, min: 0, default: undefined },
  },
  { _id: false }
);

const tokenRulesSchema = new Schema<ITokenRules>(
  {
    enabled: { type: Boolean, default: undefined },
    monthlyAccrualTokens: { type: Number, min: 0, default: undefined },
    vestingMonths: { type: Number, min: 0, default: undefined },
    tokenValueUsd: { type: Number, min: 0, default: undefined },
  },
  { _id: false }
);

const schema = new Schema<IProgramConfig>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    scope: { type: String, enum: CONFIG_SCOPES, required: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', default: null, index: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', default: null, index: true },
    tenancyId: { type: Schema.Types.ObjectId, ref: 'Tenancy', default: null, index: true },
    programType: { type: String, enum: PROGRAM_TYPES, default: null },
    rewardRules: { type: rewardRulesSchema, default: null },
    tokenRules: { type: tokenRulesSchema, default: null },
    effectiveDate: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'program_configs' }
);

// One config document per scope target
schema.index(
  { orgId: 1, scope: 1, propertyId: 1, unitId: 1, tenancyId: 1 },
  { unique: true }
);

export const ProgramConfigModel = mongoose.model<IProgramConfig>('ProgramConfig', schema);
