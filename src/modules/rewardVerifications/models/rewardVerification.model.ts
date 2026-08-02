import mongoose, { Schema, Document } from 'mongoose';
import { RewardsCampaignEligibleBehaviors, RewardsCampaignEligibleBehavior } from '../../rewardsCampaigns/models/rewardsCampaign.model';
import { RewardTypes, RewardType } from '../../rewards/types/rewardType';

/**
 * Full RPA reward lifecycle (P1 - Rewards Campaign Builder / RPA Rewards Points Workflow).
 * ELIGIBLE rows are created by a landlord/PM flagging a tenant as eligible for a behavior
 * before proof is submitted; a tenant can also submit directly, which skips straight to
 * SUBMITTED. Always issues RewardType points/credits via the ledger's REWARD kind — never
 * a TEPA ownership token (see unifiedLedgerTypes.ts LedgerKind).
 */
export const RewardVerificationStatuses = [
  'ELIGIBLE',
  'SUBMITTED',
  'PENDING_VERIFICATION',
  'APPROVED',
  'ISSUED',
  'DENIED',
  'DISPUTED',
  'RESOLVED',
] as const;
export type RewardVerificationStatus = (typeof RewardVerificationStatuses)[number];

export type RewardVerificationResolutionOutcome = 'UPHELD' | 'OVERTURNED';

export interface IRewardVerificationAttachment {
  fileKey: string;
  fileName: string;
  fileType: string;
}

export interface IRewardVerification extends Document {
  _id: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  unitId?: mongoose.Types.ObjectId | null;
  tenantUserId: mongoose.Types.ObjectId;
  campaignId?: mongoose.Types.ObjectId | null;
  eligibleBehavior: RewardsCampaignEligibleBehavior;
  rewardType: RewardType;
  status: RewardVerificationStatus;
  proofNote?: string | null;
  attachments: IRewardVerificationAttachment[];
  creditsRequested?: number | null;
  creditsAwarded: number;
  markedEligibleBy?: mongoose.Types.ObjectId | null;
  markedEligibleAt?: Date | null;
  submittedAt?: Date | null;
  reviewedBy?: mongoose.Types.ObjectId | null;
  reviewedAt?: Date | null;
  denialReason?: string | null;
  disputeReason?: string | null;
  disputedAt?: Date | null;
  resolvedBy?: mongoose.Types.ObjectId | null;
  resolvedAt?: Date | null;
  resolutionOutcome?: RewardVerificationResolutionOutcome | null;
  resolutionNote?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IRewardVerification>(
  {
    orgId:              { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    propertyId:         { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    unitId:             { type: Schema.Types.ObjectId, ref: 'Unit', default: null, index: true },
    tenantUserId:       { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    campaignId:         { type: Schema.Types.ObjectId, default: null, index: true },
    eligibleBehavior:   { type: String, enum: RewardsCampaignEligibleBehaviors, required: true },
    rewardType:         { type: String, enum: RewardTypes, default: 'POINTS' },
    status:             { type: String, enum: RewardVerificationStatuses, default: 'SUBMITTED', index: true },
    proofNote:          { type: String, default: null, maxlength: 2000 },
    attachments:        { type: [{ fileKey: String, fileName: String, fileType: String }], default: [] },
    creditsRequested:   { type: Number, default: null, min: 0 },
    creditsAwarded:      { type: Number, default: 0, min: 0 },
    markedEligibleBy:   { type: Schema.Types.ObjectId, ref: 'User', default: null },
    markedEligibleAt:   { type: Date, default: null },
    submittedAt:        { type: Date, default: null },
    reviewedBy:         { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt:         { type: Date, default: null },
    denialReason:       { type: String, default: null, maxlength: 1000 },
    disputeReason:      { type: String, default: null, maxlength: 1000 },
    disputedAt:         { type: Date, default: null },
    resolvedBy:         { type: Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt:         { type: Date, default: null },
    resolutionOutcome:  { type: String, enum: ['UPHELD', 'OVERTURNED'], default: null },
    resolutionNote:     { type: String, default: null, maxlength: 1000 },
  },
  { timestamps: true, collection: 'reward_verifications' }
);

schema.index({ orgId: 1, propertyId: 1, status: 1 });
schema.index({ tenantUserId: 1, status: 1 });

export const RewardVerificationModel = mongoose.model<IRewardVerification>(
  'RewardVerification',
  schema
);
