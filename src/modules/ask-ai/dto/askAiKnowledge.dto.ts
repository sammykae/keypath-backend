import { z } from 'zod';
import { SOURCE_TYPES, AUDIENCE_ROLES } from '../models/askAiKnowledgeDoc.model';

export const createKnowledgeDocBodySchema = z.object({
  title: z.string().min(1).max(500),
  sourceType: z.enum(SOURCE_TYPES as unknown as [string, ...string[]]),
  audienceRole: z.enum(AUDIENCE_ROLES as unknown as [string, ...string[]]),
  content: z.string().min(1).max(50000),
  version: z.string().min(1).max(50),
});
export type CreateKnowledgeDocBody = z.infer<typeof createKnowledgeDocBodySchema>;

export const listKnowledgeDocsQuerySchema = z.object({
  sourceType: z.enum(SOURCE_TYPES as unknown as [string, ...string[]]).optional(),
  audienceRole: z.enum(AUDIENCE_ROLES as unknown as [string, ...string[]]).optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
});
export type ListKnowledgeDocsQuery = z.infer<typeof listKnowledgeDocsQuerySchema>;

export const searchKnowledgeBodySchema = z.object({
  query: z.string().min(1).max(2000),
  limit: z.number().min(1).max(20).optional().default(5),
  audienceRole: z.enum(['tenant', 'landlord', 'community', 'investor', 'admin']).optional(),
  sourceType: z.enum(SOURCE_TYPES as unknown as [string, ...string[]]).optional(),
});
export type SearchKnowledgeBody = z.infer<typeof searchKnowledgeBodySchema>;
