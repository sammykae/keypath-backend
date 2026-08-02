import mongoose from 'mongoose';
import { z } from 'zod';

export const CreateStripePaymentIntentSchema = z
  .object({
    /** Required for TOKEN_PURCHASE. Omit for RENT — server sets amount from tenancy.rentAmount */
    amount: z.number().positive().optional(),
    type: z.enum(['RENT', 'TOKEN_PURCHASE']),
    period: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .optional(),
    /** Required when the tenant has more than one ACTIVE tenancy (e.g. multiple units). Must belong to the caller. */
    tenancyId: z
      .string()
      .refine((id) => mongoose.Types.ObjectId.isValid(id), { message: 'tenancyId must be a valid ObjectId' })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'RENT' && data.amount !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Do not send amount for RENT; it is derived from lease (tenancy.rentAmount)',
        path: ['amount'],
      });
    }
    if (data.type === 'TOKEN_PURCHASE' && data.amount === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'amount is required for TOKEN_PURCHASE',
        path: ['amount'],
      });
    }
  });

export type CreateStripePaymentIntentBody = z.infer<typeof CreateStripePaymentIntentSchema>;
