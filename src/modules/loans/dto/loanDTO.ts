import { z } from "zod";

const ExtensionOptionSchema = z.object({
  months: z.number().int().min(0),
  terms: z.string(),
  windowStart: z.coerce.date(),
  windowEnd: z.coerce.date()
}).refine(
  (data) => data.windowEnd > data.windowStart,
  {
    message: "Window end must be after window start",
    path: ["windowEnd"]
  }
);

export const CreateLoanSchema = z.object({
  propertyId: z.string().min(1, 'Property ID is required'),
  lender: z.string().min(1, 'Lender name is required'),
  type: z.enum(['PERM', 'CONST', 'MEZZ', 'PREF']),
  rateType: z.enum(['FIXED', 'FLOATING', 'BALLOON']),
  rate: z.number().min(0),
  origBalance: z.number().min(0),
  currentBalance: z.number().min(0),
  originationDate: z.coerce.date(),
  maturityDate: z.coerce.date(),
  interestOnlyMonths: z.number().int().min(0).default(0),
  prepayPenalty: z.union([z.record(z.string(), z.any()), z.string()]).optional(),
  extensionOptions: z.array(ExtensionOptionSchema).default([])
}).refine(
  (data) => data.maturityDate > data.originationDate,
  {
    message: "Maturity date must be after origination date",
    path: ["maturityDate"]
  }
).refine(
  (data) => data.currentBalance <= data.origBalance,
  {
    message: "Current balance cannot exceed original balance",
    path: ["currentBalance"]
  }
);

export const UpdateLoanSchema = CreateLoanSchema.partial();

export type CreateLoanDTO = z.infer<typeof CreateLoanSchema>;
export type UpdateLoanDTO = z.infer<typeof UpdateLoanSchema>;

