import mongoose, { Schema, Document } from 'mongoose';
import type { CampaignTriggerEvent } from '../types/campaignTriggerEvent';
import { RewardTypes, RewardType } from '../../rewards/types/rewardType';

export type CampaignStatus = 'ACTIVE' | 'PAUSED' | 'ENDED';

export interface ICampaign extends Document {
  _id: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  /** UI "Goal: …" line */
  goal?: string;
  /** Program window (landlord rewards card duration) */
  startsAt?: Date;
  endsAt?: Date;
  /** UI budget column — max $ shown for the program */
  budgetUsd?: number;
  /** Cap on total tokens issued from this campaign (sum of ledger CREDIT amounts) */
  budgetTokenCap?: number;
  /** UI AI-style headline under title */
  suggestionHeadline?: string;
  /** UI second bullet (e.g. "extending program…") */
  suggestionDetail?: string;
  status: CampaignStatus;
  triggerEvent: CampaignTriggerEvent;
  /** RPA reward type this campaign issues — always points/credits/badges, never a TEPA ownership token. */
  rewardType: RewardType;
  creditAmount: number;
  propertyId?: mongoose.Types.ObjectId;
  unitId?: mongoose.Types.ObjectId;
  createdByUserId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const campaignSchema = new Schema<ICampaign>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    goal: { type: String, trim: true },
    startsAt: { type: Date },
    endsAt: { type: Date },
    budgetUsd: { type: Number, min: 0 },
    budgetTokenCap: { type: Number, min: 0 },
    suggestionHeadline: { type: String, trim: true },
    suggestionDetail: { type: String, trim: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'PAUSED', 'ENDED'],
      default: 'ACTIVE',
      index: true,
    },
    triggerEvent: { type: String, required: true, index: true },
    rewardType: { type: String, enum: RewardTypes, default: 'POINTS' },
    creditAmount: { type: Number, required: true, min: 0 },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', index: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', index: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

campaignSchema.index({ orgId: 1, status: 1, triggerEvent: 1 });

export const CampaignModel = mongoose.model<ICampaign>('Campaign', campaignSchema);
