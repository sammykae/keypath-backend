import { z } from "zod";

export const CreateActivitySchema = z.object({
  orgId: z.string().min(1, 'Organization ID is required'),
  entity: z.object({
    type: z.string().min(1, 'Entity type is required'),
    id: z.string().min(1, 'Entity ID is required')
  }),
  actorId: z.string().min(1, 'Actor ID is required'),
  action: z.string().min(1, 'Action is required'),
  meta: z.record(z.string(), z.any()).default({})
});

export const ActivityResponseSchema = z.object({
  _id: z.string(),
  orgId: z.string(),
  entity: z.object({
    type: z.string(),
    id: z.string()
  }),
  actorId: z.string(),
  action: z.string(),
  meta: z.record(z.string(), z.any()),
  createdAt: z.date()
});

export type CreateActivityDTO = z.infer<typeof CreateActivitySchema>;
export type ActivityResponseDTO = z.infer<typeof ActivityResponseSchema>;

