import { GoogleGenAI } from "@google/genai";
import { logger } from '../../../core/logger';
import { Chunk, EmbeddedChunk } from "../types/ragTypes";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY as string,
});

// Gemini API embedding model (see https://ai.google.dev/gemini-api/docs/embeddings)
// 768 dimensions to match MongoDB Atlas vector index
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 768;

// Generate embeddings for a single text
export const generateEmbeddings = async (text: string): Promise<number[]> => {
  try {
    const response = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
      config: {
        outputDimensionality: EMBEDDING_DIMENSIONS,
      },
    } as any);

    const values = response.embeddings?.[0]?.values ?? (response as any).embedding?.values;
    if (!values || !Array.isArray(values)) {
      throw new Error("No embeddings returned");
    }
    return values as number[];
  } catch (error: any) {
    const message = error?.message ?? String(error);
    logger.error({ message, stack: error?.stack }, 'Failed to generate embedding');
    throw new Error(`Embedding failed: ${message}`);
  }
};

// Pass the array of chunks to embed 
export const embedChunks = async (chunks: Chunk[]): Promise<EmbeddedChunk[]> => {
  const embeddedChunks: EmbeddedChunk[] = [];
  
  for (const chunk of chunks) {
    const embedding = await generateEmbeddings(chunk.content);
    embeddedChunks.push({
      ...chunk,
      embedding,
    });
  }
  return embeddedChunks;
};

export const embedQuery = async (query: string): Promise<number[]> => {
  return generateEmbeddings(query);
};
