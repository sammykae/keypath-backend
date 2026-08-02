import { z } from 'zod';
import { mongoIdSchema } from '../../../validators/common';
import { DocumentStatus } from '../models/document.model';

const documentStatusEnum = z.enum([
  DocumentStatus.PROCESSING,
  DocumentStatus.NEEDS_REVIEW,
  DocumentStatus.COMPLETED,
  DocumentStatus.FAILED,
]);
const statusSchema = z.union([documentStatusEnum, z.literal('uploaded')]).optional();

export const uploadUrlBodySchema = z.object({
  contentType: z.string().max(100).optional(),
  fileName: z.string().max(255).optional(),
});
export type UploadUrlBody = z.infer<typeof uploadUrlBodySchema>;

export const completeDocBodySchema = z.object({
  fileKey: z.string().min(1).max(512),
  type: z.string().min(1).max(100),
  status: statusSchema,
  error: z.string().max(2000).optional(),
  propertyId: mongoIdSchema.optional(),
  unitId: mongoIdSchema.optional(),
});
export type CompleteDocBody = z.infer<typeof completeDocBodySchema>;

export const listDocsQuerySchema = z.object({
  status: z.string().max(50).optional(),
  type: z.string().max(100).optional(),
  propertyId: mongoIdSchema.optional(),
  unitId: mongoIdSchema.optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
});
export type ListDocsQuery = z.infer<typeof listDocsQuerySchema>;
