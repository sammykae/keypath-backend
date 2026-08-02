import { z } from 'zod';

export const ImpactMetricsSchema = z.object({
  retentionUplift: z.string(),
  affordabilityPreserved: z.string()
});

export const CreatePortfolioSchema = z.object({
  landlordName: z.string().min(1, 'Landlord name is required'),
  location: z.string().min(1, 'Location is required'),
  capRate: z.number().min(0).max(100),
  tokenSupply: z.number().int().min(1),
  impactMetrics: ImpactMetricsSchema
});

export const UpdatePortfolioSchema = CreatePortfolioSchema.partial();

export const PortfolioResponseSchema = z.object({
  id: z.string(),
  landlordName: z.string(),
  location: z.string(),
  capRate: z.number(),
  tokenSupply: z.number(),
  impactMetrics: ImpactMetricsSchema
});

export type CreatePortfolioDTO = z.infer<typeof CreatePortfolioSchema>;
export type UpdatePortfolioDTO = z.infer<typeof UpdatePortfolioSchema>;
export type PortfolioResponseDTO = z.infer<typeof PortfolioResponseSchema>;


