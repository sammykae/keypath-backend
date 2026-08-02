import { z } from 'zod';

// Admin accounts are internal-only — not creatable via the public register endpoint.
export const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    role: z.enum(['TENANT', 'LANDLORD', 'COMMUNITY', 'COMMUNITY_STAKEHOLDER', 'INVESTOR']),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phone: z.string().optional(),
    onboardingToken: z.string().optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string(),
  }),
});
