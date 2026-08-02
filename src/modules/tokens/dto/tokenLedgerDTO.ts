import { z } from "zod";

export const CreateTokenLedgerSchema = z.object({
  orgId: z.string().min(1, 'Organization ID is required'),
  propertyId: z.string().min(1, 'Property ID is required'),
  unitId: z.string().optional(),
  tenantId: z.string().optional(),
  allocationPool: z.enum(['LANDLORD', 'TENANT', 'INVESTOR']).optional(),
  delta: z.number().refine(val => val !== 0, 'Delta cannot be zero'),
  reason: z.enum(['RENT_ACCRUAL', 'BONUS', 'CORRECTION', 'REDEMPTION']),
  ts: z.coerce.date().optional()
});

export const TokenLedgerResponseSchema = z.object({
  _id: z.string(),
  orgId: z.string(),
  propertyId: z.string(),
  unitId: z.string().optional(),
  tenantId: z.string().optional(),
  allocationPool: z.enum(['LANDLORD', 'TENANT', 'INVESTOR']).optional(),
  delta: z.number(),
  reason: z.string(),
  ts: z.date()
});

export type CreateTokenLedgerDTO = z.infer<typeof CreateTokenLedgerSchema>;
export type TokenLedgerResponseDTO = z.infer<typeof TokenLedgerResponseSchema>;

