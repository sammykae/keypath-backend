import { SafetyCheckResult, RoleContext } from '../types/askAi.types';
import { BLOCKED_TOPICS } from '../config/askAi.config';
import { logger } from '../../../core/logger';

const BLOCKED_PATTERNS = [
  /password/i,
  /credit\s*card/i,
  /ssn|social\s*security/i,
  /bank\s*account/i,
  /hack|exploit/i,
  /bypass\s*security/i,
  /ignore\s*(previous|above)\s*instructions/i,
  /pretend\s*you\s*are/i,
  /act\s*as\s*if/i,
  /disregard\s*your\s*instructions/i,
];

const containsBlockedPatterns = (query: string): string[] => {
  const blocked: string[] = [];
  
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(query)) {
      blocked.push(pattern.toString());
    }
  }

  return blocked;
};

const containsBlockedTopics = (query: string): string[] => {
  const lowerQuery = query.toLowerCase();
  return BLOCKED_TOPICS.filter((topic) => lowerQuery.includes(topic.toLowerCase()));
};

const checkRoleBasedRestrictions = (
  query: string,
  roleContext: RoleContext
): string[] => {
  const blocked: string[] = [];
  const lowerQuery = query.toLowerCase();

  if (roleContext.role === 'tenant') {
    if (
      lowerQuery.includes('other tenant') ||
      lowerQuery.includes('all tenants') ||
      lowerQuery.includes('tenant list')
    ) {
      blocked.push('Cannot access other tenants data');
    }
    if (
      lowerQuery.includes('landlord financials') ||
      lowerQuery.includes('property revenue')
    ) {
      blocked.push('Cannot access landlord financial data');
    }
  }

  if (roleContext.role === 'landlord') {
    if (
      lowerQuery.includes('investor portfolio') ||
      lowerQuery.includes('investor returns')
    ) {
      blocked.push('Cannot access investor-specific data');
    }
  }

  if (roleContext.role === 'community') {
    if (
      lowerQuery.includes('specific tenant') ||
      lowerQuery.includes('financial details') ||
      lowerQuery.includes('revenue')
    ) {
      blocked.push('Cannot access detailed financial or tenant data');
    }
  }

  return blocked;
};

const sanitizeQuery = (query: string): string => {
  let sanitized = query.trim();
  
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  
  if (sanitized.length > 2000) {
    sanitized = sanitized.substring(0, 2000);
  }

  return sanitized;
};

export const performSafetyCheck = (
  query: string,
  roleContext: RoleContext
): SafetyCheckResult => {
  logger.debug({ query, role: roleContext.role }, 'Performing safety check');

  const blockedReasons: string[] = [];

  const patternBlocks = containsBlockedPatterns(query);
  if (patternBlocks.length > 0) {
    blockedReasons.push('Query contains restricted patterns');
  }

  const topicBlocks = containsBlockedTopics(query);
  if (topicBlocks.length > 0) {
    blockedReasons.push(`Query references restricted topics: ${topicBlocks.join(', ')}`);
  }

  const roleBlocks = checkRoleBasedRestrictions(query, roleContext);
  blockedReasons.push(...roleBlocks);

  const isSafe = blockedReasons.length === 0;
  const sanitizedQuery = sanitizeQuery(query);

  logger.info(
    {
      isSafe,
      blockedReasons,
      role: roleContext.role,
    },
    'Safety check completed'
  );

  return {
    isSafe,
    blockedReasons,
    sanitizedQuery: isSafe ? sanitizedQuery : undefined,
  };
};

/**
 * Inline citation brackets we strip from the displayed answer.
 * Structured citations are built by citationFormatter from raw text before this runs.
 * Add new patterns here if the model outputs other citation formats (e.g. [Doc 1], [Ref 2]).
 */
const CITATION_PATTERNS = [
  /\[Source\s*\d+(?:\s*,\s*Source\s*\d+)*[^\]]*\]/gi,
  /\[Core\s+Principle\s*\d+[^\]]*\]/gi,
];

export const sanitizeResponse = (response: string): string => {
  let sanitized = response;
  for (const pattern of CITATION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }
  sanitized = sanitized.replace(/\n## Citations\s*\n[\s\S]*$/i, '');
  sanitized = sanitized.replace(/\n:\s*This source[^\n]*/gi, '');
  sanitized = sanitized.replace(/\n\s*This source (explains|mentions)[^\n]*/gi, '');
  sanitized = sanitized.replace(
    /mongodb(\+srv)?:\/\/[^\s]+/gi,
    '[REDACTED_CONNECTION_STRING]'
  );
  sanitized = sanitized.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    (match) => {
      if (match.includes('keypath') || match.includes('example')) {
        return match;
      }
      return '[REDACTED_EMAIL]';
    }
  );

  return sanitized
    .replace(/  +/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

/**
 * Strip trailing incomplete citation text (e.g. "[Source 4, Source" or "[Core Principle 1").
 * Used on stream chunks so partial citations split across chunks are never sent.
 */
export const stripTrailingPartialCitations = (text: string): string => {
  return text
    .replace(/\s*\[Source\s*\d+(?:\s*,\s*Source\s*\d*)*\s*$/gi, '')
    .replace(/\s*\[Core\s+Principle\s*\d*\s*$/gi, '');
};

export const stripMarkdown = (text: string): string => {
  let out = text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*]\s+/gm, ' ')
    .replace(/^\s*\d+\.\s+/gm, ' ')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/\*/g, '')
    .replace(/_/g, '');
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return out;
};

export const truncateToWords = (text: string, maxWords: number): string => {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const words = trimmed.split(/\s+/);
  if (words.length <= maxWords) return trimmed;
  const taken = words.slice(0, maxWords).join(' ');
  const lastPeriod = taken.lastIndexOf('.');
  if (lastPeriod > 0) return taken.slice(0, lastPeriod + 1).trim();
  return taken.trim();
};

export const countWords = (text: string): number => {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
};

const LOW_CONFIDENCE_MESSAGE = "I'm not fully certain based on the current KeyPath data.";
const MEDIUM_CONFIDENCE_SUFFIX = ' Based on current KeyPath materials.';

export const applyConfidenceFallback = (
  answer: string,
  confidence: 'high' | 'medium' | 'low'
): string => {
  const trimmed = answer.trim();
  if (confidence === 'low') return LOW_CONFIDENCE_MESSAGE;
  if (confidence === 'medium' && trimmed) return trimmed + MEDIUM_CONFIDENCE_SUFFIX;
  return trimmed;
};
