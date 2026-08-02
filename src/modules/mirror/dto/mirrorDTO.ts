import { z } from 'zod';

export const MirrorPreviewQuerySchema = z.object({
  since: z.coerce.date().optional(),
  propertyId: z.string().optional(),
  orgId: z.string().optional()
});

export const MirrorPreviewResponseSchema = z.object({
  deltas: z.array(z.object({
    propertyId: z.string(),
    unitId: z.string().optional(),
    amount: z.number(),
    reason: z.enum(['RENT_ACCRUAL', 'BONUS', 'CORRECTION', 'REDEMPTION']),
    ts: z.date()
  })),
  totalTokens: z.number(),
  count: z.number()
});

export const MirrorStatusResponseSchema = z.object({
  enabled: z.boolean(),
  lastSync: z.date().nullable(),
  targetChains: z.array(z.enum(['Polygon', 'Base'])),
  pendingDeltas: z.number().optional()
});

export const ReconciliationQuerySchema = z.object({
  propertyId: z.string().optional(),
  orgId: z.string().optional()
});

export const ReconciliationResponseSchema = z.object({
  propertyId: z.string().optional(),
  orgId: z.string().optional(),
  mongoTotal: z.number(),
  onChainTotal: z.number(),
  difference: z.number(),
  status: z.enum(['MATCH', 'MISMATCH']),
  lastChecked: z.date()
});

export type MirrorPreviewQueryDTO = z.infer<typeof MirrorPreviewQuerySchema>;
export type MirrorPreviewResponseDTO = z.infer<typeof MirrorPreviewResponseSchema>;
export type MirrorStatusResponseDTO = z.infer<typeof MirrorStatusResponseSchema>;
export type ReconciliationQueryDTO = z.infer<typeof ReconciliationQuerySchema>;
export type ReconciliationResponseDTO = z.infer<typeof ReconciliationResponseSchema>;

