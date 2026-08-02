import { KnowledgeChunk } from '../../ai/models/knowledgeChunk.model';

export type AskAiMode =
  | 'tenant_dashboard'
  | 'landlord_dashboard'
  | 'community_dashboard'
  | 'investor_dashboard'
  | 'general';

export type UserRole = 'tenant' | 'landlord' | 'community' | 'investor' | 'admin';

export interface AskAiContext {
  unitId?: string;
  propertyId?: string;
  orgId?: string;
}

export interface AskAiRequest {
  question: string;
  mode: AskAiMode;
  context?: AskAiContext;
}

export interface SafetyStatus {
  blocked: boolean;
  reason?: string;
}

export interface ResponseMeta {
  requestId: string;
  model: string;
  latencyMs: number;
}

export interface Citation {
  id: string;
  source: string;
  content: string;
  relevanceScore: number;
}

export interface AskAiResponse {
  answer: string;
  citations: Citation[];
  safety: SafetyStatus;
  meta: ResponseMeta;
}

export interface RoleContext {
  role: UserRole;
  orgId: string;
  userId: string;
  permissions: string[];
  dataScope: DataScope;
}

export interface DataScope {
  canAccessProperties: boolean;
  canAccessFinancials: boolean;
  canAccessTenantData: boolean;
  canAccessInvestorData: boolean;
  ownDataOnly: boolean;
}

export interface RetrievalResult {
  chunks: KnowledgeChunk[];
  scores: number[];
  sources: string[];
  isFallback?: boolean;
}

export interface PromptContext {
  roleContext: RoleContext;
  retrievalResult: RetrievalResult;
  query: string;
  conversationHistory?: ConversationMessage[];
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface SafetyCheckResult {
  isSafe: boolean;
  blockedReasons: string[];
  sanitizedQuery?: string;
}

export interface GeminiResponse {
  text: string;
  finishReason: string;
  safetyRatings?: SafetyRating[];
}

export interface SafetyRating {
  category: string;
  probability: string;
}

export interface AskAiConfig {
  enabled: boolean;
  model: string;
  maxTokens: number;
  temperature: number;
  topK: number;
  retrievalLimit: number;
  minRelevanceScore: number;
}

export type AskAiAuditAction = 'ASK_AI_REQUESTED' | 'ASK_AI_BLOCKED' | 'ASK_AI_COMPLETED';

export interface AskAiAuditMeta {
  question: string;
  mode: AskAiMode;
  model: string;
  latencyMs: number;
  blocked?: boolean;
  blockReason?: string;
  promptLength?: number;
  retrievedChunks?: number;
  outputWordCount?: number;
  fallbackRate?: number;
  answerMode?: 'brief' | 'standard' | 'deep';
}

export interface DocCitationEntry {
  sourceIndex: number;
  chunkId: string;
  source: string;
  score: number;
}

export interface BuiltPrompt {
  systemPrompt: string;
  userPrompt: string;
  citationMap: DocCitationEntry[];
}

export interface RetrieveRelevantDocsParams {
  question: string;
  role: UserRole;
  topK?: number;
}

export interface RetrievedDoc {
  docId: string;
  title: string;
  snippet: string;
  sourceType: string;
  score: number;
}
