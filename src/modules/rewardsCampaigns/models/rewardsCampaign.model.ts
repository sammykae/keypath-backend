import mongoose, { Schema, Document } from "mongoose";
import { RewardTypes, RewardType } from "../../rewards/types/rewardType";

export const RewardsCampaignEligibleBehaviors = [
  "ON_TIME_RENT",
  "MAINTENANCE_REPORTING",
  "EARLY_RENT_PAYMENT",
  "LEASE_RENEWAL",
  "MAINTENANCE_REPORTED_EARLY",
  "HVAC_FILTER_REPLACEMENT_PHOTO",
  "MOISTURE_LEAK_CHECK_COMPLETED",
  "SAFETY_ALERT_RESPONSE",
  "SURVEY_COMPLETED",
  "PAPERLESS_ENROLLMENT",
  "COMMUNITY_PARTICIPATION",
  "TENANT_REFERRAL",
  "GOOD_UNIT_CARE_VERIFICATION",
] as const;

export type RewardsCampaignEligibleBehavior = (typeof RewardsCampaignEligibleBehaviors)[number];

export interface RewardsCampaign extends Document {
  _id: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  goal: string;
  budget: number;
  eligibleBehaviors: RewardsCampaignEligibleBehavior[];
  /** RPA reward type this campaign issues — always points/credits/badges, never a TEPA ownership token. */
  rewardType: RewardType;
  startDate?: Date;
  endDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const rewardsCampaignSchema = new Schema<RewardsCampaign>(
  {
    propertyId: { type: Schema.Types.ObjectId, ref: "Property", required: true, index: true },
    goal: { type: String, required: true, trim: true },
    budget: { type: Number, required: true, min: 0 },
    eligibleBehaviors: {
      type: [String],
      required: true,
      enum: RewardsCampaignEligibleBehaviors,
    },
    rewardType: { type: String, enum: RewardTypes, default: "POINTS" },
    startDate: { type: Date },
    endDate: { type: Date },
  },
  { timestamps: true }
);

export const RewardsCampaignModel = mongoose.model<RewardsCampaign>(
  "RewardsCampaign",
  rewardsCampaignSchema,
  "rewards_campaigns"
);

