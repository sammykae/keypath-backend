import { z } from 'zod';

// Codex: stricter TEPA input checks reduce bad writes and runtime casting errors.
const objectIdRegex = /^[a-fA-F0-9]{24}$/;

export const tepaOptInSchema = z.object({
  body: z.object({
    unitId: z
      .string()
      .regex(objectIdRegex, 'unitId must be a valid Mongo ObjectId'),
    consentVersion: z.string().min(2).max(32),
    acceptedAt: z
      .string()
      .datetime()
      .refine((value) => new Date(value).getTime() <= Date.now(), {
        message: 'acceptedAt cannot be in the future',
      }),
  }),
});
