import { z } from "zod";

export const MembershipCreateSchema = z.object({
  userId: z.string(),
  orgId: z.string(),
  role: z.string(),
  status: z.enum(["pending", "active", "disabled"]).default("pending"),
});

export type MembershipCreateDTO = z.infer<typeof MembershipCreateSchema>;
