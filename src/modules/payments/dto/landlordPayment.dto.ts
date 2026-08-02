import { z } from 'zod';

/** YYYY-MM period format */
const periodRegex = /^\d{4}-(0[1-9]|1[0-2])$/;

export const CreatePaymentBodySchema = z.object({
  tenantUserId: z.string().refine((v) => /^[a-fA-F0-9]{24}$/.test(v), 'Invalid ObjectId'),
  unitId: z.string().refine((v) => /^[a-fA-F0-9]{24}$/.test(v), 'Invalid ObjectId'),
  propertyId: z.string().refine((v) => /^[a-fA-F0-9]{24}$/.test(v), 'Invalid ObjectId'),
  period: z.string().regex(periodRegex, 'Period must be YYYY-MM'),
  amount: z.number().min(0),
  status: z.enum(['DUE', 'PAID', 'LATE', 'FAILED']).optional().default('DUE'),
  dueDate: z.string().optional(),
  paidAt: z.string().optional().nullable(),
  method: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});
export type CreatePaymentBody = z.infer<typeof CreatePaymentBodySchema>;

export const UpdatePaymentBodySchema = z.object({
  amount: z.number().min(0).optional(),
  status: z.enum(['DUE', 'PAID', 'LATE', 'FAILED']).optional(),
  paidAt: z.string().optional().nullable(),
  method: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});
export type UpdatePaymentBody = z.infer<typeof UpdatePaymentBodySchema>;

const objectIdSchema = z.string().refine((v) => /^[a-fA-F0-9]{24}$/.test(v), 'Invalid ObjectId');

/** Query for GET /landlord/payments */
export const LandlordPaymentsQuerySchema = z.object({
  range: z.string().optional().default('12m'),
  propertyId: objectIdSchema.optional(),
  unitId: objectIdSchema.optional(),
  tenantUserId: objectIdSchema.optional(),
  status: z.enum(['DUE', 'PAID', 'LATE', 'FAILED']).optional(),
});
export type LandlordPaymentsQuery = z.infer<typeof LandlordPaymentsQuerySchema>;
