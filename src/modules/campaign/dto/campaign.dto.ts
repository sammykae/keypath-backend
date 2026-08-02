import { z } from 'zod';
import { isCampaignTriggerEvent } from '../types/campaignTriggerEvent';
import { RewardTypes } from '../../rewards/types/rewardType';

const optionalDate = z.coerce.date().optional();

export const CreateCampaignSchema = z
  .object({
    orgId: z.string().min(1, 'orgId is required'),
    name: z.string().min(1, 'Name is required'),
    description: z.string().optional(),
    goal: z.string().optional(),
    startsAt: optionalDate,
    endsAt: optionalDate,
    budgetUsd: z.number().min(0).optional(),
    budgetTokenCap: z.number().min(0).optional(),
    suggestionHeadline: z.string().optional(),
    suggestionDetail: z.string().optional(),
    status: z.enum(['ACTIVE', 'PAUSED', 'ENDED']).optional().default('ACTIVE'),
    triggerEvent: z
      .string()
      .refine(isCampaignTriggerEvent, 'Invalid trigger event'),
    rewardType: z.enum(RewardTypes).optional().default('POINTS'),
    creditAmount: z.number().positive('creditAmount must be positive'),
    propertyId: z.string().optional(),
    unitId: z.string().optional(),
  })
  .refine(
    (d) => {
      if (d.startsAt && d.endsAt) return d.endsAt >= d.startsAt;
      return true;
    },
    { message: 'endsAt must be on or after startsAt', path: ['endsAt'] }
  );

export type CreateCampaignDTO = z.infer<typeof CreateCampaignSchema>;

export const UpdateCampaignSchema = z
  .object({
    orgId: z.string().min(1, 'orgId is required'),
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    goal: z.string().nullable().optional(),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    budgetUsd: z.number().min(0).nullable().optional(),
    budgetTokenCap: z.number().min(0).nullable().optional(),
    suggestionHeadline: z.string().nullable().optional(),
    suggestionDetail: z.string().nullable().optional(),
    status: z.enum(['ACTIVE', 'PAUSED', 'ENDED']).optional(),
    triggerEvent: z
      .string()
      .refine((v) => !v || isCampaignTriggerEvent(v), 'Invalid trigger event')
      .optional(),
    rewardType: z.enum(RewardTypes).optional(),
    creditAmount: z.number().positive().optional(),
    propertyId: z.string().nullable().optional(),
    unitId: z.string().nullable().optional(),
  })
  .refine(
    (o) => Object.keys(o).filter((k) => k !== 'orgId').length > 0,
    { message: 'At least one field besides orgId is required' }
  )
  .superRefine((d, ctx) => {
    if (d.startsAt != null && d.endsAt != null && d.endsAt < d.startsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'endsAt must be on or after startsAt',
        path: ['endsAt'],
      });
    }
  });

export type UpdateCampaignDTO = z.infer<typeof UpdateCampaignSchema>;

/** GET /landlord/campaigns?orgId= */
export const ListCampaignsQuerySchema = z.object({
  orgId: z.string().min(1, 'orgId is required'),
});

export type CreateCampaignPayload = Omit<z.infer<typeof CreateCampaignSchema>, 'orgId'>;
export type UpdateCampaignPayload = Omit<UpdateCampaignDTO, 'orgId'>;
