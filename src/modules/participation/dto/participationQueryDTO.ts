import { z } from "zod";

const objectIdRegex = /^[a-fA-F0-9]{24}$/;

export const ParticipationResolveQuerySchema = z
  .object({
    propertyId: z.string().regex(objectIdRegex).optional(),
    unitId: z.string().regex(objectIdRegex).optional(),
    tenancyId: z.string().regex(objectIdRegex).optional(),
    tenantId: z.string().regex(objectIdRegex).optional(),
  })
  .refine((v) => Object.values(v).filter(Boolean).length === 1, {
    message: "Provide exactly one of propertyId, unitId, tenancyId, tenantId",
  });

export type ParticipationResolveQueryDTO = z.infer<typeof ParticipationResolveQuerySchema>;

