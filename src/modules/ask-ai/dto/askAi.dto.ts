import { z } from 'zod';

export const AskAiModeEnum = z.enum([
  'tenant_dashboard',
  'landlord_dashboard',
  'community_dashboard',
  'investor_dashboard',
  'general',
]);

export const AskAiContextSchema = z
  .object({
    unitId: z.string().optional(),
    propertyId: z.string().optional(),
    orgId: z.string().optional(),
  })
  .optional();

export const AnswerModeEnum = z.enum(['brief', 'standard', 'deep']);

export const AskAiRequestSchema = z.object({
  question: z
    .string()
    .min(1, 'Question is required')
    .max(2000, 'Question must be less than 2000 characters'),
  mode: AskAiModeEnum,
  context: AskAiContextSchema,
  answerMode: AnswerModeEnum.optional(),
});

export const SafetyStatusSchema = z.object({
  blocked: z.boolean(),
  reason: z.string().optional(),
});

export const ResponseMetaSchema = z.object({
  requestId: z.string().uuid(),
  model: z.string(),
  latencyMs: z.number(),
  promptLength: z.number().optional(),
  retrievedChunks: z.number().optional(),
  outputWordCount: z.number().optional(),
  fallbackRate: z.number().optional(),
  answerMode: z.enum(['brief', 'standard', 'deep']).optional(),
});

export const CitationSchema = z.object({
  id: z.string(),
  source: z.string(),
  content: z.string(),
  relevanceScore: z.number(),
});

export const AskAiResponseSchema = z.object({
  answer: z.string(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  source_ids: z.array(z.string()).optional(),
  suggested_follow_up: z.string().optional(),
  citations: z.array(CitationSchema),
  safety: SafetyStatusSchema,
  meta: ResponseMetaSchema,
});

export const RetrieveDocsRequestSchema = z.object({
  question: z
    .string()
    .min(1, 'Question is required')
    .max(2000, 'Question must be less than 2000 characters'),
  role: z.enum(['tenant', 'landlord', 'community', 'investor', 'admin']),
  topK: z.number().int().min(1).max(8).optional(),
});

export type AskAiMode = z.infer<typeof AskAiModeEnum>;
export type AskAiContext = z.infer<typeof AskAiContextSchema>;
export type AskAiRequestDTO = z.infer<typeof AskAiRequestSchema>;
export type AskAiResponseDTO = z.infer<typeof AskAiResponseSchema>;
export type SafetyStatus = z.infer<typeof SafetyStatusSchema>;
export type ResponseMeta = z.infer<typeof ResponseMetaSchema>;
export type CitationDTO = z.infer<typeof CitationSchema>;
export type RetrieveDocsRequestDTO = z.infer<typeof RetrieveDocsRequestSchema>;
