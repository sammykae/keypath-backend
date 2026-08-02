import mongoose, { Schema, Document } from 'mongoose';

export type ChallengeCreatorType = 'ADMIN' | 'LANDLORD' | 'PROPERTY_MANAGER';
export type ChallengeVerificationMode = 'AUTOMATIC' | 'MANUAL';
export type ChallengeCatalogStatus = 'active' | 'inactive';

export interface ITenantChallenge extends Document {
  challengeId: string;
  title: string;
  description: string;
  rewardPoints: number;
  rewardTokens: number; // backward-compat alias — same value as rewardPoints
  detail: string;
  actionLabel: string;
  status: ChallengeCatalogStatus;
  creatorType: ChallengeCreatorType;
  createdBy?: mongoose.Types.ObjectId;
  orgId?: mongoose.Types.ObjectId | null;
  propertyId?: mongoose.Types.ObjectId | null;
  verificationMode: ChallengeVerificationMode;
  startDate?: Date | null;
  endDate?: Date | null;
  location?: string | null;
  maxParticipants?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const TenantChallengeSchema = new Schema<ITenantChallenge>(
  {
    challengeId:      { type: String, required: true, unique: true, index: true },
    title:            { type: String, required: true },
    description:      { type: String, required: true },
    rewardPoints:     { type: Number, required: true, min: 0 },
    rewardTokens:     { type: Number, required: false, min: 0 }, // kept for backward compat
    detail:           { type: String, required: false, default: '' },
    actionLabel:      { type: String, required: true },
    status:           { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    creatorType:      { type: String, enum: ['ADMIN', 'LANDLORD', 'PROPERTY_MANAGER'], default: 'ADMIN', index: true },
    createdBy:        { type: Schema.Types.ObjectId, ref: 'User', required: false, default: null },
    orgId:            { type: Schema.Types.ObjectId, ref: 'Organization', required: false, default: null, index: true },
    propertyId:       { type: Schema.Types.ObjectId, ref: 'Property', required: false, default: null, index: true },
    verificationMode: { type: String, enum: ['AUTOMATIC', 'MANUAL'], default: 'MANUAL' },
    startDate:        { type: Date, required: false, default: null },
    endDate:          { type: Date, required: false, default: null },
    location:         { type: String, required: false, default: null },
    maxParticipants:  { type: Number, required: false, default: null },
  },
  { timestamps: true, collection: 'tenant_challenges' }
);

// Keep rewardTokens in sync with rewardPoints on save
TenantChallengeSchema.pre('save', function (next) {
  if (this.isModified('rewardPoints')) {
    this.rewardTokens = this.rewardPoints;
  } else if (this.rewardPoints == null && this.rewardTokens != null) {
    this.rewardPoints = this.rewardTokens;
  }
  next();
});

export const TenantChallengeModel = mongoose.model<ITenantChallenge>('TenantChallenge', TenantChallengeSchema);
