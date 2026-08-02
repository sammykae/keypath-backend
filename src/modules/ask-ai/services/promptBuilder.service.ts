import { BuiltPrompt, DocCitationEntry, PromptContext, RetrievalResult, RoleContext } from '../types/askAi.types';
import { PROMPT_CHUNK_MAX_CHARS } from '../config/askAi.config';
import { logger } from '../../../core/logger';

// Patterns that must never appear in the prompt sent to the model
const PII_PATTERNS: RegExp[] = [
  /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,          // email
  /\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,       // phone (US)
  /\b\d{3}-\d{2}-\d{4}\b/g,                                         // SSN
  /\b(?:sk-|Bearer\s|token[:=\s])[A-Za-z0-9\-._~+/]{8,}\b/gi,      // secrets / tokens
];

const stripPii = (text: string): string => {
  let sanitized = text;
  for (const pattern of PII_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  return sanitized;
};

interface InjectedDocs {
  formattedContext: string;
  citationMap: DocCitationEntry[];
}

const injectDocsWithIds = (retrievalResult: RetrievalResult): InjectedDocs => {
  if (retrievalResult.chunks.length === 0) {
    return { formattedContext: '', citationMap: [] };
  }

  const citationMap: DocCitationEntry[] = [];

  const formattedContext = retrievalResult.chunks
    .map((chunk, index) => {
      const sourceIndex = index + 1;
      const score = retrievalResult.scores[index] ?? 0;
      const chunkId = chunk.chunkId || String(chunk._id) || `chunk-${sourceIndex}`;
      const sourceName = chunk.source || 'Knowledge Base';

      citationMap.push({ sourceIndex, chunkId, source: sourceName, score });

      const safeContent = stripPii(chunk.content);
      const truncated =
        safeContent.length <= PROMPT_CHUNK_MAX_CHARS
          ? safeContent
          : safeContent.slice(0, PROMPT_CHUNK_MAX_CHARS - 3) + '...';

      return `[Source ${sourceIndex} | ID: ${chunkId} | ${sourceName}]\n${truncated}`;
    })
    .join('\n\n---\n\n');

  return { formattedContext, citationMap };
};

const buildSystemPrompt = (roleContext: RoleContext): string => {
  const roleTone =
    roleContext.role === 'tenant'
      ? 'Answer in simple, plain English.'
      : roleContext.role === 'landlord'
        ? 'Answer in concise, business-oriented language.'
        : roleContext.role === 'community' || roleContext.role === 'investor'
          ? 'Answer in clear, policy-neutral language.'
          : 'Answer in clear, concise language.';

  return `You are the KeyPath AI assistant.

Tone and style:
- Write answers in simple, conversational English. Avoid academic or legal phrasing. Use short sentences. Prefer common words over technical language.
- Assume the reader is a renter, not a lawyer or investor. Avoid phrases like "digital representations of economic value." Prefer simple, direct language, e.g. "KeyPath uses tokens to represent a share of economic value in a property" or "tokens that represent a share of property value."

Rules:
- Answer in plain text only. Never use markdown, bold, headings, or bullets unless the user explicitly asks.
- Do not use numbered lists unless the user explicitly asks.
- Keep answers short and clear: 2 to 4 sentences, under 100 words. Plain text only.
- Write answers using short sentences. Avoid long lists separated by commas. Prefer two short sentences over one long sentence. Example: instead of "Renters earn tokens by paying rent, completing incentives, renewing leases, and contributing" say "Renters earn tokens through actions like paying rent on time or renewing their lease. Some programs may also include participation incentives."
- Prefer 1 short paragraph.
- If the question is simple or definitional, answer in 1 to 3 sentences.
- Be role-aware. Current role: ${roleContext.role}. ${roleTone}
- Answer directly first, then optionally one short follow-up sentence if needed.
- Tokens represent economic participation rights only, not property ownership or title. Earning tokens does not make the user a homeowner. When asked about ownership or "do I become a homeowner", say so clearly in 1 to 3 sentences.
- Use only the provided KeyPath context when possible. If the answer is uncertain, say: "I'm not fully certain based on the current KeyPath data." Do not invent legal, financial, or token mechanics.
- Do not make legal, financial, or compliance claims unless directly supported by the provided context.
- Do not guarantee or promise financial returns for renters. Tokens represent participation in economic value; outcomes depend on program terms and property performance. When asked if returns are guaranteed, say they are not.
- If the question is not about KeyPath or rental tokenization (e.g. Bitcoin price, unrelated topics), respond briefly: "I focus on questions about KeyPath and rental tokenization. I can help with how KeyPath works for renters, landlords, and communities."
- When asked whether KeyPath tokens are securities: give a cautious answer. Say they represent contractual economic participation; do not provide legal classification or legal advice. If in doubt, say "Please consult a qualified attorney or compliance professional."
- End without extra filler. No source tags, citations, or references in your answer text.
- If asked for legal advice, say: "I cannot provide legal advice. Please consult a qualified attorney."
- Do not share specific fundraising amounts, internal notes, other users' data, or secrets.`;
};

const buildUserPrompt = (
  query: string,
  formattedContext: string,
  conversationHistory?: string
): string => {
  let prompt = '';

  if (formattedContext) {
    prompt += `## Relevant Knowledge Base Information\n${formattedContext}\n\n---\n\n`;
  }

  if (conversationHistory) {
    prompt += `## Previous Conversation\n${conversationHistory}\n\n---\n\n`;
  }

  // Strip PII from the user query before sending to model
  prompt += `## User Question\n${stripPii(query)}`;

  return prompt;
};

const formatConversationHistory = (
  history?: PromptContext['conversationHistory']
): string => {
  if (!history || history.length === 0) {
    return '';
  }

  return history
    .slice(-5)
    .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
    .join('\n\n');
};

export const buildPrompt = (context: PromptContext): BuiltPrompt => {
  logger.debug({ role: context.roleContext.role }, 'Building prompt');

  const systemPrompt = buildSystemPrompt(context.roleContext);
  
  const { formattedContext, citationMap } = injectDocsWithIds(context.retrievalResult);
  const conversationHistory = formatConversationHistory(context.conversationHistory);

  const userPrompt = buildUserPrompt(
    context.query,
    formattedContext,
    conversationHistory
  );

  logger.debug(
    {
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
      hasKnowledge: !!formattedContext,
      hasHistory: !!conversationHistory,
      citationCount: citationMap.length,
    },
    'Prompt built'
  );

  return { systemPrompt, userPrompt, citationMap };
};
