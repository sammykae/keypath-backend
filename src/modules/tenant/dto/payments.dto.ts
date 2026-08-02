import { z } from 'zod';

/** Query for GET /tenant/payments */
export const TenantPaymentsQuerySchema = z.object({
  range: z.string().optional().default('12m'), // e.g. 12m
});
export type TenantPaymentsQuery = z.infer<typeof TenantPaymentsQuerySchema>;
