import { z } from "zod";

export const CreateTenantInviteSchema = z.object({
  tenantEmail: z.string().email().trim().toLowerCase(),
  propertyId: z.string().min(1),
  unitId: z.string().min(1),
  // Optional: when omitted, pre-filled from the unit/property program config (inheritance)
  participationModel: z.enum(["RPA_ONLY", "TEPA_ONLY", "BOTH"]).optional(),
  inviteMethod: z.enum(["CODE", "LINK", "BOTH"]),
  deliveryMethod: z.enum(["LANDLORD_SHARED", "KEYPATH_EMAIL"]),
  requiredAgreements: z.array(z.enum(["RPA", "TEPA", "RPA_AND_TEPA"])).optional(),
  expiresAt: z.coerce.date().optional(),
  leaseStartDate: z.coerce.date().optional(),
  leaseEndDate: z.coerce.date().optional(),
});

export type CreateTenantInviteDTO = z.infer<typeof CreateTenantInviteSchema>;

export const VerifyInviteQuerySchema = z.object({
  token: z.string().min(10).optional(),
  code: z.string().min(4).max(12).optional(),
}).refine((v) => Boolean(v.token) || Boolean(v.code), {
  message: "Either token or code is required",
});

export type VerifyInviteQueryDTO = z.infer<typeof VerifyInviteQuerySchema>;

