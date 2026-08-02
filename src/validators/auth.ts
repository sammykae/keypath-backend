import { z } from 'zod';
import { emailSchema, nonEmptyString, phoneSchema, uuidSchema } from './common';

export const loginSchema = z.object({
  email: emailSchema,
  password: nonEmptyString.min(8, 'Password must be at least 8 characters'),
});

export const signupSchema = loginSchema.extend({
  firstName: nonEmptyString.min(1, 'First name required'),
  lastName: nonEmptyString.min(1, 'Last name required'),
  role: z.enum(['TENANT', 'LANDLORD', 'COMMUNITY_STAKEHOLDER', 'INVESTOR']),
  phone: phoneSchema,
});

export const meResponseSchema = z.object({
  userId: uuidSchema,
  email: emailSchema,
  roles: z.array(z.enum(['TENANT', 'LANDLORD', 'COMMUNITY_STAKEHOLDER', 'INVESTOR', 'ADMIN'])),
  orgId: uuidSchema.optional().nullable(),
  tenantProfile: z.object({
    unitId: uuidSchema.optional().nullable(),
    propertyId: uuidSchema.optional().nullable(),
  }).optional().nullable(),
});
