// src/validators/user.ts
import { z } from 'zod';
import { emailSchema, nonEmptyString, phoneSchema } from './common';

export const updateUserProfileSchema = z.object({
  firstName: nonEmptyString.min(1).optional(),
  lastName: nonEmptyString.min(1).optional(),
  phone: phoneSchema,
  email: emailSchema.optional(), // allow email change with verification later
});