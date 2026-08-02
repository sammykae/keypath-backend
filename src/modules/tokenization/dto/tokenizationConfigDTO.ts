import { z } from "zod";

export const CreateTokenizationConfigSchema = z.object({
  propertyId: z.string().min(1, 'Property ID is required'),
  entity: z.enum(['SERIES_LLC', 'TRUST', 'OTHER']),
  equityPct: z.number().min(0).max(100),
  accrualRate: z.number().min(0),
  bonusRules: z.string(),
  rofr: z.boolean().default(false),
  holdPeriodMonths: z.number().int().min(0).default(0),
  network: z.enum(['none', 'Polygon', 'Base']).default('none')
});

export const UpdateTokenizationConfigSchema = CreateTokenizationConfigSchema.partial();

export type CreateTokenizationConfigDTO = z.infer<typeof CreateTokenizationConfigSchema>;
export type UpdateTokenizationConfigDTO = z.infer<typeof UpdateTokenizationConfigSchema>;

