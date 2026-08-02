import mongoose, { Schema, Document, Types } from 'mongoose';

export type RewardType =
  | 'GIFT_CARD'
  | 'RENT_CREDIT'
  | 'UTILITY_CREDIT'
  | 'SERVICE'
  | 'MAINTENANCE_PRIORITY'
  | 'RENEWAL_BONUS';

export type RewardProgramType = 'RPA' | 'TEPA';

export type RedemptionLimitType = 'ONE_TIME' | 'UNLIMITED' | 'LIMITED';

export interface IRedemptionLimit {
  type: RedemptionLimitType;
  maxCount?: number | null;
}

export interface IRewardCatalog extends Document {
  rewardId: string;
  title: string;
  description: string;
  costCredits: number;
  category: string;
  status: string;
  actionLabel?: string | null;
  deliveryAmount?: number | null;
  orgId?: Types.ObjectId | null;
  // RPA / TEPA separation
  rewardType?: RewardType | null;
  programType: RewardProgramType;
  requiresApproval: boolean;
  redemptionLimit: IRedemptionLimit;
  createdAt?: Date;
  updatedAt?: Date;
}

const redemptionLimitSchema = new Schema<IRedemptionLimit>(
  {
    type:     { type: String, enum: ['ONE_TIME', 'UNLIMITED', 'LIMITED'], default: 'UNLIMITED' },
    maxCount: { type: Number, default: null },
  },
  { _id: false }
);

const RewardCatalogSchema = new Schema<IRewardCatalog>(
  {
    rewardId:         { type: String, required: true, index: true },
    title:            { type: String, required: true },
    description:      { type: String, required: true },
    costCredits:      { type: Number, required: true, min: 0 },
    category:         { type: String, required: true, index: true },
    status:           { type: String, required: true, index: true },
    actionLabel:      { type: String, required: false, default: null },
    deliveryAmount:   { type: Number, required: false, default: null },
    orgId:            { type: Schema.Types.ObjectId, ref: 'Organization', required: false, default: null },
    rewardType:       {
      type: String,
      enum: ['GIFT_CARD', 'RENT_CREDIT', 'UTILITY_CREDIT', 'SERVICE', 'MAINTENANCE_PRIORITY', 'RENEWAL_BONUS', null],
      default: null,
    },
    programType:      { type: String, enum: ['RPA', 'TEPA'], default: 'RPA', index: true },
    requiresApproval: { type: Boolean, default: false },
    redemptionLimit:  { type: redemptionLimitSchema, default: () => ({ type: 'UNLIMITED', maxCount: null }) },
  },
  { timestamps: true, collection: 'reward_catalog' }
);

RewardCatalogSchema.index({ rewardId: 1, orgId: 1 }, { unique: true });

export const RewardCatalogModel = mongoose.model<IRewardCatalog>('RewardCatalog', RewardCatalogSchema);
