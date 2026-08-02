import { z } from "zod";

export const CreateTenancySchema = z.object({
  tenantUserId: z.string().min(1, 'Tenant user ID is required'),
  unitId: z.string().min(1, 'Unit ID is required'),
  leaseStart: z.coerce.date(),
  leaseEnd: z.coerce.date(),
  rentAmount: z.number().min(0, 'Rent amount must be non-negative')
}).refine(
  (data) => data.leaseEnd >= data.leaseStart,
  {
    message: "Lease end date must be on or after lease start date",
    path: ["leaseEnd"]
  }
);

export const TenancyResponseSchema = z.object({
  _id: z.string(),
  tenantUserId: z.string(),
  unitId: z.string(),
  leaseStart: z.date(),
  leaseEnd: z.date(),
  rentAmount: z.number(),
  status: z.string(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type CreateTenancyDTO = z.infer<typeof CreateTenancySchema>;
export type TenancyResponseDTO = z.infer<typeof TenancyResponseSchema>;
