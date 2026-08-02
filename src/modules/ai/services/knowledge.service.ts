import { KnowledgeChunkModel, KnowledgeChunk } from '../models/knowledgeChunk.model';
import { EmbeddedChunk } from '../types/ragTypes';

// Insert embedded chunks into MongoDB
export const insertChunks = async (chunks: EmbeddedChunk[]): Promise<void> => {
  for (const chunk of chunks) {
    await KnowledgeChunkModel.findOneAndUpdate(
      { chunkId: chunk.id },
      {
        $set: {
          chunkId: chunk.id,
          content: chunk.content,
          embedding: chunk.embedding,
          source: chunk.metadata.source,
          chunkIndex: chunk.metadata.chunkIndex,
        },
      },
      { upsert: true, new: true }
    );
  }
};


// Vector similarity search using MongoDB Atlas Vector Search
export const vectorSimilaritySearch = async (
  queryEmbedding: number[],
  limit: number = 5
): Promise<KnowledgeChunk[]> => {
  const results = await KnowledgeChunkModel.aggregate([
    {
      $vectorSearch: {
        index: "vector_index",
        path: "embedding",
        queryVector: queryEmbedding,
        numCandidates: limit * 10,
        limit: limit,
      },
    },
    {
      $project: {
        chunkId: 1,
        content: 1,
        source: 1,
        chunkIndex: 1,
        score: { $meta: "vectorSearchScore" },
      },
    },
  ]);
  
  return results;
};

