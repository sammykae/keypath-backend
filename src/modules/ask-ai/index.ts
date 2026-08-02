export { default as askAiRoutes } from './routes/askAi.routes';

export { logAskAiActivity } from './services/askAi.service';

export { askAiFeatureFlagMiddleware } from './middleware/featureFlag.middleware';
export { askAiRateLimitMiddleware } from './middleware/rateLimit.middleware';

export {
  ASK_AI_CONFIG,
  isAskAiEnabled,
  ROLE_PERMISSIONS,
  MAX_RAG_TOP_K,
  RAG_SNIPPET_MAX_CHARS,
} from './config/askAi.config';

export type {
  AskAiMode,
  UserRole,
  AskAiContext,
  AskAiRequest,
  SafetyStatus,
  ResponseMeta,
  Citation,
  AskAiResponse,
  RoleContext,
  DataScope,
  RetrievalResult,
  PromptContext,
  ConversationMessage,
  SafetyCheckResult,
  GeminiResponse,
  SafetyRating,
  AskAiConfig,
  AskAiAuditAction,
  AskAiAuditMeta,
  RetrieveRelevantDocsParams,
  RetrievedDoc,
} from './types/askAi.types';

export {
  AskAiModeEnum,
  AskAiContextSchema,
  AskAiRequestSchema,
  SafetyStatusSchema,
  ResponseMetaSchema,
  CitationSchema,
  AskAiResponseSchema,
} from './dto/askAi.dto';

export type {
  AskAiRequestDTO,
  AskAiResponseDTO,
  CitationDTO,
} from './dto/askAi.dto';

export {
  AskAiKnowledgeDocModel,
  SOURCE_TYPES,
  AUDIENCE_ROLES,
  ASK_AI_KNOWLEDGE_EMBEDDING_DIMENSIONS,
} from './models/askAiKnowledgeDoc.model';
export type { IAskAiKnowledgeDoc, SourceType, AudienceRole } from './models/askAiKnowledgeDoc.model';

export {
  insertDoc,
  vectorSearch,
  ASK_AI_KNOWLEDGE_VECTOR_INDEX,
} from './services/askAiKnowledge.service';

export { retrieveRelevantDocs } from './services/retrieval.service';
export type {
  InsertAskAiKnowledgeDocInput,
  AskAiKnowledgeSearchResult,
  VectorSearchOptions,
} from './services/askAiKnowledge.service';
