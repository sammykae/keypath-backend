import { z } from 'zod';

export const auditActivityQuerySchema = z.object({
  query: z.object({
    propertyId: z.string().min(1),
    entityType: z.string().min(1).max(120).optional(),
    action: z.string().min(1).max(200).optional(),
    actorUserId: z.string().min(1).optional(),
    tenantId: z.string().min(1).optional(),
    from: z.string().min(1).optional(),
    to: z.string().min(1).optional(),
    limit: z.coerce.number().min(1).max(100).optional().default(50),
    skip: z.coerce.number().min(0).optional().default(0),
  }),
});
