import mongoose, { Schema, Document } from 'mongoose';

export interface KnowledgeChunk extends Document {
  chunkId: string;
  content: string;
  embedding: number[];
  source: string;
  chunkIndex: number;
  createdAt: Date;
  updatedAt: Date;
}

const KnowledgeChunkSchema = new Schema<KnowledgeChunk>(
  {
    chunkId: { type: String, required: true, unique: true, index: true },
    content: { type: String, required: true },
    embedding: { type: [Number], required: true },
    source: { type: String, required: true, index: true },
    chunkIndex: { type: Number, required: true },
  },
  { timestamps: true }
);

export const KnowledgeChunkModel = mongoose.model<KnowledgeChunk>('KnowledgeChunk', KnowledgeChunkSchema);

