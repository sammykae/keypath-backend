import { z } from 'zod';

const objectIdString = z.string().refine((s) => /^[a-fA-F0-9]{24}$/.test(s), 'Invalid id');

export const UpsertTenantParticipationBodySchema = z.object({
  tenancyId: objectIdString,
  tenantParticipationType: z.enum(['NONE', 'RPA_ONLY', 'TEPA_ONLY', 'BOTH']).optional(),
  rpaEnrollmentStatus: z.enum(['PENDING', 'ACTIVE', 'DECLINED', 'ENDED']).optional(),
  tepaEnrollmentStatus: z.enum(['PENDING', 'ACTIVE', 'DECLINED', 'ENDED']).optional(),
});

export type UpsertTenantParticipationBody = z.infer<typeof UpsertTenantParticipationBodySchema>;

export const TenancyIdQuerySchema = z.object({
  tenancyId: objectIdString,
});
