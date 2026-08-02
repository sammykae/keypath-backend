import { z } from "zod";

export const PropertyCreateSchema = z.object({
  orgId: z.string().min(1, 'Organization ID is required').optional(),
  name: z.string().min(1, 'Property name is required').max(200),
  slug: z.string().min(1).max(120).optional(),
  address: z.object({
    line1: z.string().min(1, 'Address line 1 is required'),
    city: z.string().min(1, 'City is required'),
    state: z.string().min(1, 'State is required').max(50),
    postalCode: z.string().min(5, 'Postal code is required'),
    country: z.string().default('US')
  }),
  type: z.enum(['SFR', 'MF', 'BTR', 'Condo', 'Other']),
  status: z.enum(['ONBOARDING', 'LIVE', 'PAUSED']).default('ONBOARDING'),
  tokenizedPct: z.number().min(0).max(100).default(0)
});

export const UpdatePropertySchema = PropertyCreateSchema.partial();

export const PropertyResponseSchema = z.object({
  _id: z.string(),
  orgId: z.string(),
  name: z.string(),
  address: z.object({
    line1: z.string(),
    city: z.string(),
    state: z.string(),
    postalCode: z.string(),
    country: z.string()
  }),
  type: z.string(),
  status: z.string(),
  tokenizedPct: z.number(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type PropertyCreateDTO = z.infer<typeof PropertyCreateSchema>;
export type UpdatePropertyDTO = z.infer<typeof UpdatePropertySchema>;
export type PropertyResponseDTO = z.infer<typeof PropertyResponseSchema>;
