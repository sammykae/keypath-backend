import mongoose, { Schema, Document } from 'mongoose';

export const SOURCE_TYPES = ['FAQ', 'TEPA_SUMMARY', 'PRODUCT_DOC', 'POLICY'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const AUDIENCE_ROLES = ['TENANT', 'LANDLORD', 'COMMUNITY', 'INVESTOR', 'ALL'] as const;
export type AudienceRole = (typeof AUDIENCE_ROLES)[number];

export const ASK_AI_KNOWLEDGE_EMBEDDING_DIMENSIONS = 768;

export interface IAskAiKnowledgeDoc extends Document {
  title: string;
  sourceType: SourceType;
  audienceRole: AudienceRole;
  content: string;
  version: string;
  embedding: number[];
  createdAt: Date;
  updatedAt?: Date;
}

const AskAiKnowledgeDocSchema = new Schema<IAskAiKnowledgeDoc>(
  {
    title: { type: String, required: true },
    sourceType: {
      type: String,
      required: true,
      enum: SOURCE_TYPES,
      index: true,
    },
    audienceRole: {
      type: String,
      required: true,
      enum: AUDIENCE_ROLES,
      index: true,
    },
    content: { type: String, required: true },
    version: { type: String, required: true },
    embedding: {
      type: [Number],
      required: true,
      validate: {
        validator: (v: number[]) =>
          Array.isArray(v) && v.length === ASK_AI_KNOWLEDGE_EMBEDDING_DIMENSIONS,
        message: `embedding must be an array of ${ASK_AI_KNOWLEDGE_EMBEDDING_DIMENSIONS} numbers`,
      },
    },
  },
  {
    timestamps: true,
    collection: 'askAiKnowledgeDocs',
  }
);

export const AskAiKnowledgeDocModel = mongoose.model<IAskAiKnowledgeDoc>(
  'AskAiKnowledgeDoc',
  AskAiKnowledgeDocSchema
);
