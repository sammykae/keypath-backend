import { z } from 'zod';

export const CreateTransactionSchema = z.object({
  event_id: z.string().min(1, 'Event ID is required'),
  counterparty_user_id: z.string().optional(),
  status: z.enum(['pending', 'completed', 'cancelled']).default('pending')
});

export const UpdateTransactionSchema = CreateTransactionSchema.partial();

export const TransactionResponseSchema = z.object({
  _id: z.string(),
  event_id: z.string(),
  counterparty_user_id: z.string().optional(),
  status: z.enum(['pending', 'completed', 'cancelled']),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export type CreateTransactionDTO = z.infer<typeof CreateTransactionSchema>;
export type UpdateTransactionDTO = z.infer<typeof UpdateTransactionSchema>;
export type TransactionResponseDTO = z.infer<typeof TransactionResponseSchema>;


