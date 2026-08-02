import { z } from "zod";

export const OrgCreateSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["landlord", "tenant", "community", "investor"]),
});

export type OrgCreateDTO = z.infer<typeof OrgCreateSchema>;
