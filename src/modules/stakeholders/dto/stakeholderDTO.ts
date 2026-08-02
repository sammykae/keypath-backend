import { z } from "zod";

const DeliverableSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  dueDate: z.coerce.date(),
  status: z.enum(['PENDING', 'COMPLETED', 'OVERDUE']).default('PENDING')
});

const ContactSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.object({
    line1: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().optional()
  }).optional()
});

export const CreateStakeholderSchema = z.object({
  orgId: z.string().min(1, 'Organization ID is required'),
  type: z.enum(['COMMUNITY', 'INVESTOR']),
  name: z.string().min(1, 'Name is required'),
  contact: ContactSchema,
  tokensAllocated: z.number().min(0).default(0),
  tokensEarned: z.number().min(0).default(0),
  deliverables: z.array(DeliverableSchema).default([])
});

export const UpdateStakeholderSchema = CreateStakeholderSchema.partial();

export const UpdateDeliverablesSchema = z.object({
  deliverables: z.array(DeliverableSchema)
});

export type CreateStakeholderDTO = z.infer<typeof CreateStakeholderSchema>;
export type UpdateStakeholderDTO = z.infer<typeof UpdateStakeholderSchema>;
export type UpdateDeliverablesDTO = z.infer<typeof UpdateDeliverablesSchema>;

