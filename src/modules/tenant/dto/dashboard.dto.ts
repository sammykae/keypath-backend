import { z } from 'zod';

/** Query for GET /tenant/dashboard */
export const TenantDashboardQuerySchema = z.object({
  range: z.enum(['30d', '90d', '1y']).optional().default('30d'),
});
export type TenantDashboardQuery = z.infer<typeof TenantDashboardQuerySchema>;
