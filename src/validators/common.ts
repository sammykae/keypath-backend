
import { z } from 'zod';

// Reusable primitives
export const emailSchema = z
  .string()
  .email({ message: 'Invalid email address' })
  .max(255);

export const uuidSchema = z.string().uuid({ message: 'Invalid UUID' });

export const mongoIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId');

export const nonEmptyString = z.string().min(1, 'Required field');

export const optionalString = z.string().optional().nullable();

export const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number')
  .optional();

export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date (YYYY-MM-DD)')
  .optional();

/** Accepts date-only (YYYY-MM-DD) or full ISO datetime, normalizes to ISO datetime */
export const isoDateOrDateOnlySchema = z
  .string()
  .transform((val) => (/^\d{4}-\d{2}-\d{2}$/.test(val) ? `${val}T00:00:00.000Z` : val))
  .pipe(z.string().datetime({ message: 'Invalid date, use YYYY-MM-DD or ISO datetime' }));