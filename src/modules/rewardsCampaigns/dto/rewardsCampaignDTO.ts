import { z } from "zod";
import { RewardsCampaignEligibleBehaviors } from "../models/rewardsCampaign.model";
import { RewardTypes } from "../../rewards/types/rewardType";

const objectIdRegex = /^[a-fA-F0-9]{24}$/;

export const RewardsCampaignEligibleBehaviorSchema = z.enum(RewardsCampaignEligibleBehaviors);

export const CreateRewardsCampaignSchema = z
  .object({
    propertyId: z.string().regex(objectIdRegex),
    goal: z.string().min(1),
    budget: z.number().positive(),
    eligibleBehaviors: z.array(RewardsCampaignEligibleBehaviorSchema).min(1),
    rewardType: z.enum(RewardTypes).optional().default("POINTS"),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
  })
  .refine((d) => !d.startDate || !d.endDate || d.endDate >= d.startDate, {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });

export type CreateRewardsCampaignDTO = z.infer<typeof CreateRewardsCampaignSchema>;

