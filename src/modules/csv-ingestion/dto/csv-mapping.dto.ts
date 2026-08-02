import { z } from 'zod';

const objectIdRegex = /^[a-fA-F0-9]{24}$/;

/**
 * PATCH /api/csv/:ingestionId/mapping
 * Body: { mapping: Record<csvHeader, canonicalFieldName | null> }
 */
export const saveMappingSchema = z.object({
  params: z.object({
    ingestionId: z
      .string()
      .regex(objectIdRegex, 'ingestionId must be a valid Mongo ObjectId'),
  }),
  body: z.object({
    mapping: z
      .record(z.string(), z.string().nullable())
      .refine((m) => Object.keys(m).length > 0, {
        message: 'mapping must contain at least one entry',
      }),
  }),
});

/**
 * POST /api/csv/:ingestionId/process
 */
export const triggerProcessSchema = z.object({
  params: z.object({
    ingestionId: z
      .string()
      .regex(objectIdRegex, 'ingestionId must be a valid Mongo ObjectId'),
  }),
});
