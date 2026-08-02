import { z } from 'zod';

/** Body for POST /tenant/rewards/:rewardId/redeem */
export const RedeemRewardBodySchema = z.object({
  idempotencyKey: z.string().min(1, 'Idempotency key is required'),
});
export type RedeemRewardBody = z.infer<typeof RedeemRewardBodySchema>;
