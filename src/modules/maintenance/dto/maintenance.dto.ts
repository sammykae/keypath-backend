import { z } from 'zod';

export const SubmitMaintenanceSchema = z.object({
  tenancyId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  issueType: z.enum(['PLUMBING', 'HVAC', 'APPLIANCE', 'MOISTURE', 'ELECTRICAL', 'GENERAL']).default('GENERAL'),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('LOW'),
  attachments: z.array(z.object({
    fileKey: z.string(),
    fileName: z.string(),
    fileType: z.string(),
  })).default([]),
});

export type SubmitMaintenanceInput = z.infer<typeof SubmitMaintenanceSchema>;
