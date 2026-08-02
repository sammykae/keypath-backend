import { z } from "zod";

export const CreateRewardBodySchema = z.object({
  name: z.string().min(1, "Name is required"),
  creditCost: z.number().int().min(0, "Credit cost must be 0 or more"),
  orgId: z.union([z.string(), z.null()]).optional(),
});

export type CreateRewardBody = z.infer<typeof CreateRewardBodySchema>;
