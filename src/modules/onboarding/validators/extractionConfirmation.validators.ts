import { z } from 'zod';

const lineageSchema = z.object({
  extractionId: z.string().optional(),
  model: z.string().optional(),
  documentId: z.string().optional(),
  extractedAt: z.string().optional(),
});

const extractionFieldSchema = z.object({
  fieldKey: z.string().min(1).max(256),
  value: z.unknown(),
  source: z.enum(['ai', 'manual']),
  confidence: z.number().min(0).max(1).optional(),
  lineage: lineageSchema.optional(),
});

export const upsertExtractionFieldsSchema = z.object({
  body: z.object({
    scope: z.string().min(1).max(128),
    fields: z.array(extractionFieldSchema).min(1).max(200),
  }),
});

export const recordOverrideSchema = z.object({
  body: z.object({
    scope: z.string().min(1).max(128),
    fieldKey: z.string().min(1).max(256),
    value: z.unknown(),
  }),
});

export const confirmFieldsSchema = z.object({
  body: z.object({
    scope: z.string().min(1).max(128),
    fieldKeys: z.array(z.string().min(1).max(256)).min(1).max(200),
  }),
});

export const getFieldsQuerySchema = z.object({
  query: z.object({
    scope: z.string().min(1).max(128),
  }),
});

export const getUnconfirmedQuerySchema = z.object({
  query: z.object({
    scope: z.string().max(128).optional(),
  }),
});
