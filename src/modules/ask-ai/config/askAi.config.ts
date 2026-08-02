import { AskAiConfig } from '../types/askAi.types';

const isTruthyFlag = (value: string | undefined, fallback: boolean): boolean => {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  // Treat common "off" strings as disabled; everything else remains enabled.
  return !['false', '0', 'off', 'no'].includes(normalized);
};

const resolveAskAiEnabled = (): boolean => {
  // AI-018 kill switch: FEATURE_ASK_AI is the primary runtime flag; ASK_AI_ENABLED is legacy fallback.
  if (process.env.FEATURE_ASK_AI != null) {
    return isTruthyFlag(process.env.FEATURE_ASK_AI, true);
  }
  return isTruthyFlag(process.env.ASK_AI_ENABLED, true);
};

export const ASK_AI_CONFIG: AskAiConfig = {
  enabled: resolveAskAiEnabled(),
  model: process.env.GEMINI_MODEL || process.env.ASK_AI_MODEL || 'gemini-2.5-flash',
  maxTokens: parseInt(process.env.GEMINI_MAX_TOKENS || process.env.ASK_AI_MAX_TOKENS || '1024', 10),
  temperature: parseFloat(process.env.GEMINI_TEMPERATURE || process.env.ASK_AI_TEMPERATURE || '0.7'),
  topK: parseInt(process.env.ASK_AI_TOP_K || '40', 10),
  retrievalLimit: parseInt(process.env.ASK_AI_RETRIEVAL_LIMIT || '5', 10),
  minRelevanceScore: parseFloat(process.env.ASK_AI_MIN_RELEVANCE || '0.5'),
};

export const FALLBACK_RELEVANCE_SCORE = 0.3;

export const MAX_RAG_TOP_K = 8;

export const RAG_SNIPPET_MAX_CHARS = 300;

export const STREAM_RAG_MAX_CHUNKS = 4;

export const AI_CONTEXT_CACHE_TTL_MS = parseInt(
  process.env.AI_CONTEXT_CACHE_TTL_MS || String(5 * 60 * 1000),
  10
);

export const PROMPT_CHUNK_MAX_CHARS = 280;

export const ANSWER_MAX_WORDS_BRIEF = 90;
export const ANSWER_MAX_WORDS_STANDARD = 200;
export const ANSWER_MAX_WORDS_DEEP = 300;

export type AnswerMode = 'brief' | 'standard' | 'deep';

export const ANSWER_MAX_WORDS_BY_MODE: Record<AnswerMode, number> = {
  brief: ANSWER_MAX_WORDS_BRIEF,
  standard: ANSWER_MAX_WORDS_STANDARD,
  deep: ANSWER_MAX_WORDS_DEEP,
};

export const isAskAiEnabled = (): boolean => {
  return resolveAskAiEnabled();
};

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  tenant: [
    'view:own_tokens',
    'view:own_payments',
    'view:own_property',
    'ask:general',
    'ask:tenant_specific',
  ],
  landlord: [
    'view:properties',
    'view:tenants',
    'view:financials',
    'ask:general',
    'ask:landlord_specific',
    'ask:property_analytics',
  ],
  investor: [
    'view:portfolio',
    'view:returns',
    'view:market_data',
    'ask:general',
    'ask:investor_specific',
  ],
  community: [
    'view:community_stats',
    'ask:general',
    'ask:community_specific',
  ],
  admin: [
    'view:all',
    'ask:all',
  ],
};

export const BLOCKED_TOPICS = [
  'fundraising amounts',
  'specific loi',
  'deal sizes',
  'internal bd notes',
  'confidential',
  'private investor details',
];
