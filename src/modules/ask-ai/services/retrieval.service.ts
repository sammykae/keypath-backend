import {
  type RetrieveRelevantDocsParams,
  type RetrievedDoc,
  type RetrievalResult,
  type RoleContext,
  type UserRole,
} from '../types/askAi.types';
import { embedQuery } from '../../ai/services/embedder.service';
import { vectorSimilaritySearch } from '../../ai/services/knowledge.service';
import { vectorSearch } from './askAiKnowledge.service';
import {
  ASK_AI_CONFIG,
  FALLBACK_RELEVANCE_SCORE,
  MAX_RAG_TOP_K,
  RAG_SNIPPET_MAX_CHARS,
  STREAM_RAG_MAX_CHUNKS,
} from '../config/askAi.config';
import { logger } from '../../../core/logger';
import { KnowledgeChunk } from '../../ai/models/knowledgeChunk.model';
import { getOrRefreshPropertyContextPayload } from './aiContextCache.service';

const truncateSnippet = (text: string, maxChars: number): string => {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return trimmed.slice(0, maxChars - 3) + '...';
};

const filterChunksByRole = (
  chunks: KnowledgeChunk[],
  roleContext: RoleContext
): KnowledgeChunk[] => {
  return chunks.filter((chunk) => {
    const source = chunk.source?.toLowerCase() || '';
    
    if (roleContext.role === 'admin') {
      return true;
    }

    if (source.includes('internal') || source.includes('confidential')) {
      return false;
    }

    if (roleContext.role === 'tenant') {
      return !source.includes('landlord_only') && !source.includes('investor_only');
    }

    if (roleContext.role === 'landlord') {
      return !source.includes('investor_only');
    }

    if (roleContext.role === 'investor') {
      return !source.includes('landlord_operations');
    }

    return true;
  });
};

export interface RetrieveRelevantContextOptions {
  maxChunks?: number;
  propertyIdForContext?: string;
}

export const retrieveRelevantContext = async (
  query: string,
  roleContext: RoleContext,
  options?: RetrieveRelevantContextOptions
): Promise<RetrievalResult> => {
  const startTime = Date.now();
  const maxChunks = options?.maxChunks ?? STREAM_RAG_MAX_CHUNKS;

  logger.info({ query, role: roleContext.role, maxChunks }, 'Starting retrieval');

  try {
    const queryEmbedding = await embedQuery(query);

    const rawChunks = await vectorSimilaritySearch(
      queryEmbedding,
      Math.max(ASK_AI_CONFIG.retrievalLimit * 2, maxChunks)
    );

    const filteredChunks = filterChunksByRole(rawChunks, roleContext);

    const relevantChunks = filteredChunks
      .filter((chunk: any) => chunk.score >= ASK_AI_CONFIG.minRelevanceScore)
      .slice(0, maxChunks);

    let finalChunks = relevantChunks;
    let isFallback = false;

    if (relevantChunks.length === 0 && filteredChunks.length > 0) {
      finalChunks = filteredChunks
        .filter((chunk: any) => chunk.score >= FALLBACK_RELEVANCE_SCORE)
        .slice(0, maxChunks);
      isFallback = true;
      logger.info({ fallbackChunks: finalChunks.length }, 'Using fallback citations');
    }

    let resultChunks = finalChunks as KnowledgeChunk[];
    let resultScores = finalChunks.map((c: any) => c.score || 0);
    let resultSources = [...new Set(finalChunks.map((c) => c.source || 'unknown'))];

    if (options?.propertyIdForContext) {
      const scoped = await getOrRefreshPropertyContextPayload(options.propertyIdForContext);
      if (scoped) {
        const ctxChunk = {
          chunkId: `ai-context-property:${options.propertyIdForContext}`,
          content: `Structured property snapshot (ai_context_cache):\n${JSON.stringify(scoped)}`,
          source: 'ai_context_cache',
          chunkIndex: 0,
          score: 1,
        } as unknown as KnowledgeChunk;
        const merged = [ctxChunk, ...finalChunks].slice(0, maxChunks);
        resultChunks = merged as unknown as KnowledgeChunk[];
        resultScores = merged.map((c: any) => c.score || 0);
        resultSources = [...new Set(merged.map((c) => c.source || 'unknown'))];
      }
    }

    const result: RetrievalResult = {
      chunks: resultChunks,
      scores: resultScores,
      sources: resultSources,
      isFallback,
    };

    logger.info(
      {
        chunksFound: rawChunks.length,
        chunksAfterFilter: filteredChunks.length,
        chunksReturned: relevantChunks.length,
        sources: result.sources,
        durationMs: Date.now() - startTime,
      },
      'Retrieval completed'
    );

    return result;
  } catch (error) {
    logger.error({ error, query }, 'Retrieval failed');
    return {
      chunks: [],
      scores: [],
      sources: [],
    };
  }
};

export const formatRetrievalForPrompt = (
  retrievalResult: RetrievalResult
): string => {
  if (retrievalResult.chunks.length === 0) {
    return '';
  }

  return retrievalResult.chunks
    .map((chunk, index) => {
      const score = retrievalResult.scores[index];
      return `[Source ${index + 1}: ${chunk.source || 'Knowledge Base'}]\n${chunk.content}`;
    })
    .join('\n\n---\n\n');
};

export const retrieveRelevantDocs = async (
  params: RetrieveRelevantDocsParams
): Promise<RetrievedDoc[]> => {
  const { question, role, topK: requestedTopK = 5 } = params;
  const topK = Math.min(Math.max(1, requestedTopK), MAX_RAG_TOP_K);

  logger.info({ question: question.slice(0, 80), role, topK }, 'RAG retrieveRelevantDocs');

  try {
    const queryEmbedding = await embedQuery(question);

    const searchRole: UserRole = role === 'admin' ? 'admin' : role;
    const rawResults = await vectorSearch(queryEmbedding, {
      limit: topK,
      audienceRole: searchRole,
    });

    const docs: RetrievedDoc[] = rawResults.map((r) => ({
      docId: r._id,
      title: r.title,
      snippet: truncateSnippet(r.content, RAG_SNIPPET_MAX_CHARS),
      sourceType: r.sourceType,
      score: typeof r.score === 'number' ? r.score : 0,
    }));

    logger.debug(
      { returned: docs.length, role, topK },
      'retrieveRelevantDocs completed'
    );
    return docs;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      { err: message, question: question.slice(0, 80), role },
      'retrieveRelevantDocs failed'
    );
    return [];
  }
};
