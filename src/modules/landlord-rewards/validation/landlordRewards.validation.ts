import { z } from 'zod';

const categoryEnum = z.enum(['rent credit', 'gift card', 'services', 'utility credit', 'maintenance priority', 'renewal bonus']);
const statusEnum = z.enum(['active', 'inactive']);
const rewardTypeEnum = z.enum(['GIFT_CARD', 'RENT_CREDIT', 'UTILITY_CREDIT', 'SERVICE', 'MAINTENANCE_PRIORITY', 'RENEWAL_BONUS']);
const programTypeEnum = z.enum(['RPA', 'TEPA']);
const redemptionLimitTypeEnum = z.enum(['ONE_TIME', 'UNLIMITED', 'LIMITED']);

const redemptionLimitSchema = z.object({
  type: redemptionLimitTypeEnum.default('UNLIMITED'),
  maxCount: z.number().int().min(1).nullable().optional(),
});

export const createLandlordRewardSchema = z.object({
  rewardId:         z.string().min(1).regex(/^[a-z0-9-]+$/, 'rewardId must be lowercase alphanumeric and hyphens only'),
  title:            z.string().min(1).max(200),
  description:      z.string().min(1).max(1000),
  costCredits:      z.number().int().min(0),
  category:         categoryEnum,
  status:           statusEnum.default('active'),
  actionLabel:      z.string().max(100).optional(),
  deliveryAmount:   z.number().min(0).nullable().optional(),
  rewardType:       rewardTypeEnum.optional().nullable(),
  programType:      programTypeEnum.default('RPA'),
  requiresApproval: z.boolean().default(false),
  redemptionLimit:  redemptionLimitSchema.default({ type: 'UNLIMITED' }),
});

export const patchLandlordRewardSchema = z.object({
  title:            z.string().min(1).max(200).optional(),
  description:      z.string().min(1).max(1000).optional(),
  costCredits:      z.number().int().min(0).optional(),
  category:         categoryEnum.optional(),
  status:           statusEnum.optional(),
  actionLabel:      z.string().max(100).optional(),
  deliveryAmount:   z.number().min(0).nullable().optional(),
  rewardType:       rewardTypeEnum.optional().nullable(),
  programType:      programTypeEnum.optional(),
  requiresApproval: z.boolean().optional(),
  redemptionLimit:  redemptionLimitSchema.optional(),
}).refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required to update' });

export type CreateLandlordRewardInput = z.infer<typeof createLandlordRewardSchema>;
export type PatchLandlordRewardInput = z.infer<typeof patchLandlordRewardSchema>;
