import { z } from "zod";

export const CreateTenantSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  email: z.string().email("Valid email is required").transform((v) => v.trim().toLowerCase()),
  phone: z.string().min(7).max(25).optional(),
  // Client can send status, but backend will ignore it (BE-201 spec)
  status: z.enum(["INVITED", "ACTIVE", "INACTIVE", "REMOVED"]).optional(),
  source: z.enum(["INVITE", "SELF_SIGNUP"]),
});

export const UpdateTenantSchema = CreateTenantSchema.partial();

export const TenantResponseSchema = z.object({
  _id: z.string(),
  fullName: z.string(),
  email: z.string(),
  phone: z.string().optional(),
  source: z.string(),
  status: z.string(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const VerifyTenantEmailSchema = z.object({
  token: z.string().min(10, "Verification token is required"),
});

export type CreateTenantDTO = z.infer<typeof CreateTenantSchema>;
export type UpdateTenantDTO = z.infer<typeof UpdateTenantSchema>;
export type TenantResponseDTO = z.infer<typeof TenantResponseSchema>;

export type VerifyTenantEmailDTO = z.infer<typeof VerifyTenantEmailSchema>;

