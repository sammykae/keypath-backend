import { z } from "zod";

export const CreateUnitFinancialsSchema = z.object({
  unitId: z.string().min(1, 'Unit ID is required'),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format'),
  rentScheduled: z.number().min(0),
  rentCollected: z.number().min(0),
  paidStatus: z.enum(['PAID', 'PARTIAL', 'UNPAID']).default('UNPAID'),
  arrearsAmount: z.number().min(0).default(0),
  arrearsDays: z.number().int().min(0).default(0),
  maintenance: z.number().min(0).default(0),
  utilities: z.number().min(0).default(0),
  pmFeePct: z.number().min(0).max(100).default(0),
  taxesAlloc: z.number().min(0).default(0),
  insuranceAlloc: z.number().min(0).default(0),
  debtServiceAlloc: z.number().min(0).default(0)
});

export const UpdateUnitFinancialsSchema = CreateUnitFinancialsSchema.partial();

export type CreateUnitFinancialsDTO = z.infer<typeof CreateUnitFinancialsSchema>;
export type UpdateUnitFinancialsDTO = z.infer<typeof UpdateUnitFinancialsSchema>;

