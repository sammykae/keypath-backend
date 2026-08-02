import mongoose from 'mongoose';
import { AskAiKnowledgeDocModel, type AudienceRole, type IAskAiKnowledgeDoc } from '../models/askAiKnowledgeDoc.model';
import type { UserRole } from '../types/askAi.types';

export const ASK_AI_KNOWLEDGE_VECTOR_INDEX = 'ask_ai_knowledge_vector_index';

const roleToAudienceRole = (role: UserRole): AudienceRole => {
  const r = role?.toLowerCase();
  if (r === 'tenant' || r === 'landlord' || r === 'community' || r === 'investor') {
    return r.toUpperCase() as AudienceRole;
  }
  return 'ALL';
};

export interface InsertAskAiKnowledgeDocInput {
  title: string;
  sourceType: IAskAiKnowledgeDoc['sourceType'];
  audienceRole: AudienceRole;
  content: string;
  version: string;
  embedding: number[];
}

export const insertDoc = async (
  input: InsertAskAiKnowledgeDocInput
): Promise<IAskAiKnowledgeDoc> => {
  const doc = await AskAiKnowledgeDocModel.create({
    title: input.title,
    sourceType: input.sourceType,
    audienceRole: input.audienceRole,
    content: input.content,
    version: input.version,
    embedding: input.embedding,
  });
  return doc.toObject() as IAskAiKnowledgeDoc;
};

export interface AskAiKnowledgeSearchResult {
  _id: string;
  title: string;
  sourceType: string;
  audienceRole: string;
  content: string;
  version: string;
  score: number;
}

export interface VectorSearchOptions {
  limit?: number;
  audienceRole?: UserRole;
  sourceType?: IAskAiKnowledgeDoc['sourceType'];
}

export const vectorSearch = async (
  queryEmbedding: number[],
  options: VectorSearchOptions = {}
): Promise<AskAiKnowledgeSearchResult[]> => {
  const { limit = 5, audienceRole: userRole, sourceType } = options;

  const filterParts: Record<string, unknown>[] = [];
  if (userRole && userRole !== 'admin') {
    const role = roleToAudienceRole(userRole);
    filterParts.push({ audienceRole: { $in: [role, 'ALL'] } });
  }
  if (sourceType) {
    filterParts.push({ sourceType });
  }
  const filter =
    filterParts.length > 0 ? { $and: filterParts } : undefined;

  const pipeline: mongoose.PipelineStage[] = [
    {
      $vectorSearch: {
        index: ASK_AI_KNOWLEDGE_VECTOR_INDEX,
        path: 'embedding',
        queryVector: queryEmbedding,
        numCandidates: Math.min(limit * 20, 100),
        limit,
        ...(filter ? { filter } : {}),
      },
    },
    {
      $project: {
        _id: 1,
        title: 1,
        sourceType: 1,
        audienceRole: 1,
        content: 1,
        version: 1,
        score: { $meta: 'vectorSearchScore' },
      },
    },
  ];

  const results = await AskAiKnowledgeDocModel.aggregate(pipeline);
  return results.map((r) => ({
    ...r,
    _id: r._id.toString(),
  }));
};
