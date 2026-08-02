import { z } from 'zod';

export const CreateOfferSchema = z.object({
  portfolioId: z.string().min(1, 'Portfolio ID is required'),
  buyerId: z.string().min(1, 'Buyer ID is required'),
  offerAmount: z.number().min(0, 'Offer amount must be positive'),
  currency: z.string().min(1, 'Currency is required'),
  paymentMethod: z.enum(['fiat', 'crypto']),
  status: z.enum(['pending', 'accepted', 'rejected']).default('pending')
});

export const UpdateOfferSchema = CreateOfferSchema.partial();

export const OfferResponseSchema = z.object({
  id: z.number().optional(),
  portfolioId: z.string(),
  buyerId: z.string(),
  offerAmount: z.number(),
  currency: z.string(),
  paymentMethod: z.enum(['fiat', 'crypto']),
  status: z.enum(['pending', 'accepted', 'rejected'])
});

export type CreateOfferDTO = z.infer<typeof CreateOfferSchema>;
export type UpdateOfferDTO = z.infer<typeof UpdateOfferSchema>;
export type OfferResponseDTO = z.infer<typeof OfferResponseSchema>;


