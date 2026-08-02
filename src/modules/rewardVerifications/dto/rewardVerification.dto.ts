import { z } from 'zod';
import { RewardsCampaignEligibleBehaviors } from '../../rewardsCampaigns/models/rewardsCampaign.model';
import { RewardTypes } from '../../rewards/types/rewardType';
import { RewardVerificationStatuses } from '../models/rewardVerification.model';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const AttachmentSchema = z.object({
  fileKey: z.string().min(1),
  fileName: z.string().min(1),
  fileType: z.string().min(1),
});

export const MarkEligibleSchema = z.object({
  propertyId: objectId,
  unitId: objectId.optional(),
  tenantUserId: objectId,
  campaignId: objectId.optional(),
  eligibleBehavior: z.enum(RewardsCampaignEligibleBehaviors),
  rewardType: z.enum(RewardTypes).optional().default('POINTS'),
  creditsRequested: z.number().positive().optional(),
});
export type MarkEligibleInput = z.infer<typeof MarkEligibleSchema>;

export const SubmitVerificationSchema = z.object({
  propertyId: objectId,
  unitId: objectId.optional(),
  campaignId: objectId.optional(),
  eligibleBehavior: z.enum(RewardsCampaignEligibleBehaviors),
  rewardType: z.enum(RewardTypes).optional().default('POINTS'),
  proofNote: z.string().max(2000).optional(),
  attachments: z.array(AttachmentSchema).max(10).optional().default([]),
  creditsRequested: z.number().positive().optional(),
});
export type SubmitVerificationInput = z.infer<typeof SubmitVerificationSchema>;

export const ReviewVerificationSchema = z.object({
  action: z.enum(['APPROVE', 'DENY']),
  creditsAwarded: z.number().positive().optional(),
  denialReason: z.string().max(1000).optional(),
}).refine((d) => d.action !== 'DENY' || !!d.denialReason, {
  message: 'denialReason is required when denying',
  path: ['denialReason'],
});
export type ReviewVerificationInput = z.infer<typeof ReviewVerificationSchema>;

export const DisputeVerificationSchema = z.object({
  disputeReason: z.string().min(1).max(1000),
});
export type DisputeVerificationInput = z.infer<typeof DisputeVerificationSchema>;

export const ResolveDisputeSchema = z.object({
  outcome: z.enum(['UPHOLD', 'OVERTURN']),
  creditsAwarded: z.number().positive().optional(),
  resolutionNote: z.string().max(1000).optional(),
});
export type ResolveDisputeInput = z.infer<typeof ResolveDisputeSchema>;

export const ListVerificationsQuerySchema = z.object({
  propertyId: objectId.optional(),
  status: z.enum(RewardVerificationStatuses).optional(),
  tenantUserId: objectId.optional(),
});
export type ListVerificationsQuery = z.infer<typeof ListVerificationsQuerySchema>;
