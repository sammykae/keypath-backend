import { z } from 'zod';

export const CapTableRecalculateBody = z
  .object({
    propertyId: z.string().min(1),
    /** If provided and differs from summed ledger, adds TOKEN_MISMATCH warning. */
    expectedLedgerTotal: z.number().optional(),
  })
  .strict();

export type CapTableRecalculateBody = z.infer<typeof CapTableRecalculateBody>;
