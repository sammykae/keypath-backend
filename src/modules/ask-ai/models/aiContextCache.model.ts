import mongoose, { Schema, Document, Types } from 'mongoose';

export interface AiContextCache extends Document {
  _id: Types.ObjectId;
  entityType: string;
  entityId: Types.ObjectId;
  payload: Record<string, unknown>;
  generatedAt: Date;
}

const AiContextCacheSchema = new Schema<AiContextCache>(
  {
    entityType: { type: String, required: true, index: true },
    entityId: { type: Schema.Types.ObjectId, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
    generatedAt: { type: Date, required: true, index: true },
  },
  { collection: 'ai_context_cache' }
);

AiContextCacheSchema.index({ entityType: 1, entityId: 1 }, { unique: true });

export const AiContextCacheModel = mongoose.model<AiContextCache>(
  'AiContextCache',
  AiContextCacheSchema
);
