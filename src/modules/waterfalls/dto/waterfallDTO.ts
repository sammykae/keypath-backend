import { z } from "zod";

const PromoteTierSchema = z.object({
  hurdleIRR: z.number().min(0),
  gpPct: z.number().min(0).max(100),
  lpPct: z.number().min(0).max(100)
}).refine(
  (data) => data.gpPct + data.lpPct === 100,
  {
    message: "GP and LP percentages must sum to 100",
    path: ["lpPct"]
  }
);

export const CreateWaterfallSchema = z.object({
  orgId: z.string().min(1, 'Organization ID is required'),
  propertyId: z.string().optional(),
  prefReturnPct: z.number().min(0).max(100),
  promoteTiers: z.array(PromoteTierSchema).default([])
});

export const UpdateWaterfallSchema = CreateWaterfallSchema.partial();

export type CreateWaterfallDTO = z.infer<typeof CreateWaterfallSchema>;
export type UpdateWaterfallDTO = z.infer<typeof UpdateWaterfallSchema>;

