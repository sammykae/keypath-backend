import { z } from 'zod';

const onboardingCardInputSchema = z.object({
  id: z.string().min(1).max(128),
  insuranceExpiryDate: z.string().nullable().optional(),
  noticeOfDefault: z.boolean().nullable().optional(),
  mortgageAmount: z.number().min(0).nullable().optional(),
  propertyValue: z.number().min(0).nullable().optional(),
  ownershipPct: z.number().min(0).max(100).nullable().optional(),
  expectedOwnershipPct: z.number().min(0).max(100).nullable().optional(),
});

export const evaluateRiskBadgesSchema = z.object({
  body: z.object({
    cards: z.array(onboardingCardInputSchema).min(0).max(500),
    requiredFieldKeys: z.array(z.string().min(1).max(64)).optional(),
  }),
});

export type EvaluateRiskBadgesBody = z.infer<typeof evaluateRiskBadgesSchema>['body'];
