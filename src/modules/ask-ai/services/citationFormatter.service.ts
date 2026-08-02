import { Citation, DocCitationEntry, RetrievalResult } from '../types/askAi.types';
import { logger } from '../../../core/logger';

export const formatCitations = (
  retrievalResult: RetrievalResult,
  response: string,
  citationMap?: DocCitationEntry[]
): Citation[] => {
  const citations: Citation[] = [];

  if (retrievalResult.chunks.length === 0) {
    return citations;
  }

  const sourcePattern = /\[Source\s*(\d+)[^\]]*\]/gi;
  const citedSources = new Set<number>();
  
  let match;
  while ((match = sourcePattern.exec(response)) !== null) {
    const sourceNum = parseInt(match[1], 10);
    citedSources.add(sourceNum);
  }

  retrievalResult.chunks.forEach((chunk, index) => {
    const sourceNum = index + 1;
    
    if (citedSources.size === 0 || citedSources.has(sourceNum)) {
      const mappedEntry = citationMap?.find((e) => e.sourceIndex === sourceNum);
      citations.push({
        id: mappedEntry?.chunkId ?? chunk.chunkId ?? `source-${sourceNum}`,
        source: chunk.source || 'Knowledge Base',
        content: truncateContent(chunk.content, 200),
        relevanceScore: mappedEntry?.score ?? retrievalResult.scores[index] ?? 0,
      });
    }
  });

  logger.debug(
    {
      totalChunks: retrievalResult.chunks.length,
      citedSources: citedSources.size,
      citationsReturned: citations.length,
    },
    'Citations formatted'
  );

  return citations;
};

const truncateContent = (content: string, maxLength: number): string => {
  if (content.length <= maxLength) {
    return content;
  }
  return content.substring(0, maxLength - 3) + '...';
};

export const formatResponseWithCitations = (
  response: string,
  citations: Citation[]
): string => {
  if (citations.length === 0) {
    return response;
  }

  let formatted = response;

  formatted = formatted.replace(/\[Source\s*(\d+)[^\]]*\]/gi, (match, num) => {
    const index = parseInt(num, 10) - 1;
    if (index >= 0 && index < citations.length) {
      return `[${index + 1}]`;
    }
    return match;
  });

  return formatted;
};

export const generateCitationSummary = (citations: Citation[]): string => {
  if (citations.length === 0) {
    return '';
  }

  const sources = [...new Set(citations.map((c) => c.source))];
  return `Sources: ${sources.join(', ')}`;
};
