import { z } from "zod";
import { CreditEventType } from "../types/creditEventTypes";
import { TokenLedgerEntryType } from "../models/tokenLedgerEntry.model";

export const CreateCreditEventSchema = z.object({
  accountId: z.string().min(1, 'Account ID is required'),
  type: z.nativeEnum(CreditEventType),
  amount: z.number().min(0, 'Amount must be non-negative'),
  occurredAt: z.coerce.date().optional(),
  description: z.string().optional(),
  referenceId: z.string().optional(),
  idempotencyKey: z.string().min(1, 'Idempotency key is required'),
  /** BE-204: business event type for unified reward ledger (optional). */
  eventType: z.string().optional(),
  propertyId: z.string().optional(),
});

export const CreateCreditAccountSchema = z.object({
  tenantUserId: z.string().min(1, 'Tenant user ID is required'),
  orgId: z.string().optional(),
  unitId: z.string().optional()
});

/** API type for issuing credits (maps to CREDIT or ADJUSTMENT internally) */
export const IssueCreditTypeSchema = z.enum(['EARN', 'ADJUST']);
export type IssueCreditType = z.infer<typeof IssueCreditTypeSchema>;

/** Body for POST /landlord/credits/issue */
export const IssueCreditsSchema = z.object({
  tenantUserId: z.string().min(1, 'Tenant user ID is required'),
  amount: z.number().positive('Amount must be positive'),
  reason: z.string().min(1, 'Reason is required'),
  propertyId: z.string().optional(),
  unitId: z.string().optional(),
  idempotencyKey: z.string().min(1, 'Idempotency key is required'),
  type: IssueCreditTypeSchema.optional().default('EARN'),
  orgId: z.string().optional(),
  /** BE-204: optional business eventType for unified ledger (e.g. ON_TIME_RENT). */
  eventType: z.string().optional(),
});
export type IssueCreditsDTO = z.infer<typeof IssueCreditsSchema>;

/** Query params for GET /tenant/ownership-credits */
export const OwnershipCreditsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(25),
  type: z.enum(['EARN', 'REDEEM', 'ADJUST', 'EXPIRE']).optional(),
});
export type OwnershipCreditsQuery = z.infer<typeof OwnershipCreditsQuerySchema>;

/** GET /api/ledger/unified/entries — tenant self-service */
export const UnifiedLedgerQuerySchema = z.object({
  ledgerKind: z.enum(['REWARD', 'OWNERSHIP']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(25),
});

export type CreateCreditEventDTO = z.infer<typeof CreateCreditEventSchema>;
export type CreateCreditAccountDTO = z.infer<typeof CreateCreditAccountSchema>;

export const CreateTokenLedgerEntrySchema = z.object({
  property_id: z.string().min(1, "Property ID is required"),
  tenant_id: z.string().min(1, "Tenant ID is required"),
  type: z.nativeEnum(TokenLedgerEntryType),
  tokens: z.number(),
  value: z.number().optional(),
  timestamp: z.coerce.date().optional(),
  source: z.string().min(1, "Source is required"),
});

export type CreateTokenLedgerEntryDTO = z.infer<typeof CreateTokenLedgerEntrySchema>;
