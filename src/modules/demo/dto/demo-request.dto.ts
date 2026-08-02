import { z } from 'zod';

const phoneRegex = /^\+?[1-9]\d{6,14}$/;

export const createDemoRequestBodySchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  phoneNumber: z
    .string()
    .trim()
    .min(7)
    .max(20)
    .regex(phoneRegex, 'phoneNumber must be in international format, e.g. +15551234567'),
  titleOrRole: z.string().trim().min(1).max(150),
  companyOrOrganization: z.string().trim().min(1).max(200),
  interestedAs: z.string().trim().min(1).max(120),
  inquiryNotes: z.string().trim().max(2000).optional(),
});

export const createDemoRequestSchema = z.object({
  body: createDemoRequestBodySchema,
});

export type CreateDemoRequestBody = z.infer<typeof createDemoRequestBodySchema>;
