import mongoose, { Schema, Document } from 'mongoose';

interface IExternalIds {
  yardi?: string;
  appfolio?: string;
  realpage?: string;
  buildium?: string;
  entrata?: string;
  rentmanager?: string;
  innago?: string;
  avail?: string;
  argus?: string;
}

interface ITokenConfig {
  totalSupply?: number;
  pricePerToken?: number;
  contractAddress?: string;
}
/** Caps what tenant participation types are allowed at this property (BE-202). */
export type PropertyTenantParticipationAllowed =
  | 'NONE'
  | 'RPA_ONLY'
  | 'TEPA_ONLY'
  | 'BOTH';

interface Property extends Document {
  _id: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  name: string;
  slug?: string;
  address: {
    line1: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  type: 'SFR' | 'MF' | 'BTR' | 'Condo' | 'Other';
  status: 'ONBOARDING' | 'LIVE' | 'PAUSED';
  participationModel: 'RPA_ONLY' | 'TEPA_ONLY' | 'BOTH';
  activationStatus: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  onboardingStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE';
  riskStatus: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  yearBuilt?: number;
  totalUnits?: number;
  estimatedPropertyValue?: number;
  tokenizedPct: number;
  externalIds?: IExternalIds;
  tokenConfig?: ITokenConfig;
  integrationStatus: 'NONE' | 'PENDING' | 'ACTIVE' | 'ERROR';
  /** Default BOTH: no restriction until explicitly narrowed. */
  tenantParticipationAllowed?: PropertyTenantParticipationAllowed;
  /** Optional authorized token supply cap for cap-table over-allocation checks (BE-310). */
  totalTokenSupply?: number;
  /** Optional last known valuation (USD); unset triggers cap-table warning. */
  valuationUsd?: number;
  /** Minimum tenant-pool tokens (anti-dilution floor); optional (BE-310). */
  tenantPoolFloorTokens?: number;
  /** S3 public URL for the primary property cover image. */
  imageUrl?: string;
  location?: string;
  normalizedName?: string;
  searchKeywords?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const propertySchema = new Schema<Property>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true },
    slug: { type: String, unique: true, sparse: true },
    address: {
      line1: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      postalCode: { type: String, required: true },
      country: { type: String, required: true, default: 'US' }
    },
    type: { 
      type: String, 
      required: true, 
      enum: ['SFR', 'MF', 'BTR', 'Condo', 'Other'] 
    },
    status: {
      type: String,
      required: true,
      enum: ['ONBOARDING', 'LIVE', 'PAUSED'],
      default: 'ONBOARDING'
    },
    participationModel: {
      type: String,
      required: true,
      enum: ['RPA_ONLY', 'TEPA_ONLY', 'BOTH'],
      default: 'RPA_ONLY'
    },
    activationStatus: {
      type: String,
      required: true,
      enum: ['PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'],
      default: 'PENDING'
    },
    onboardingStatus: {
      type: String,
      required: true,
      enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE'],
      default: 'NOT_STARTED'
    },
    riskStatus: {
      type: String,
      required: true,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'LOW'
    },
    yearBuilt: { type: Number, min: 1800 },
    totalUnits: { type: Number, min: 1 },
    estimatedPropertyValue: { type: Number, min: 0 },
    tokenizedPct: { type: Number, required: true, min: 0, max: 100, default: 0 },
    externalIds: {
      yardi: { type: String },
      appfolio: { type: String },
      realpage: { type: String },
      buildium: { type: String },
      entrata: { type: String },
      rentmanager: { type: String },
      innago: { type: String },
      avail: { type: String },
      argus: { type: String },
    },
    tokenConfig: {
      totalSupply: { type: Number, min: 0 },
      pricePerToken: { type: Number, min: 0 },
      contractAddress: { type: String },
    },
    integrationStatus: {
      type: String,
      required: true,
      enum: ['NONE', 'PENDING', 'ACTIVE', 'ERROR'],
      default: 'NONE'
    },
    tenantParticipationAllowed: {
      type: String,
      enum: ['NONE', 'RPA_ONLY', 'TEPA_ONLY', 'BOTH'],
      default: 'BOTH',
    },
    totalTokenSupply: { type: Number, min: 0 },
    valuationUsd: { type: Number, min: 0 },
    tenantPoolFloorTokens: { type: Number, min: 0 },
    imageUrl: { type: String },
    location: { type: String, index: true },
    normalizedName: { type: String, index: true },
    searchKeywords: { type: [String], default: [] },
  },
  { timestamps: true }
);

// Indexes as specified in guide
propertySchema.index({ orgId: 1, status: 1 });
propertySchema.index({ orgId: 1, 'address.city': 1 });

propertySchema.pre('save', function (next) {
  if (this.isModified('name') || this.isModified('address') || !this.normalizedName) {
    const nameLower = (this.name as string).toLowerCase().trim();
    const city = ((this.address as any)?.city ?? '').trim();
    const state = ((this.address as any)?.state ?? '').trim();
    this.location = [city, state].filter(Boolean).join(', ');
    this.normalizedName = nameLower;
    const nameParts = nameLower.split(/\s+/).filter(Boolean);
    const locationParts = this.location.toLowerCase().split(/[\s,]+/).filter(Boolean);
    this.searchKeywords = [...new Set([...nameParts, ...locationParts])];
  }
  next();
});

propertySchema.index({ normalizedName: 'text', searchKeywords: 'text' });

import { upsertPropertyEntry } from '../../search-index/services/search-index.service';
propertySchema.post('save', function (doc) {
  upsertPropertyEntry(doc.toObject()).catch((err) => {
    console.error('[SearchIndex] property upsert failed:', err.message);
  });
});

export const PropertyModel = mongoose.model<Property>('Property', propertySchema);
