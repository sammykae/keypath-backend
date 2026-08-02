import mongoose, { Document, Schema } from 'mongoose';

export interface IExtractionLineage {
  extractionId?: string;
  model?: string;
  documentId?: string;
  extractedAt?: string;
}

export interface IAiExtractionField extends Document {
  userId: mongoose.Types.ObjectId;
  scope: string;
  fieldKey: string;
  value: Schema.Types.Mixed;
  source: 'ai' | 'manual';
  confidence?: number;
  lineage?: IExtractionLineage;
  confirmedAt?: Date;
  confirmedByUserId?: mongoose.Types.ObjectId;
  overwrittenAt?: Date;
  overwrittenByUserId?: mongoose.Types.ObjectId;
  previousValue?: Schema.Types.Mixed;
  createdAt: Date;
  updatedAt: Date;
}

const ExtractionLineageSchema = new Schema(
  {
    extractionId: { type: String },
    model: { type: String },
    documentId: { type: String },
    extractedAt: { type: String },
  },
  { _id: false }
);

const AiExtractionFieldSchema = new Schema<IAiExtractionField>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    scope: { type: String, required: true, index: true },
    fieldKey: { type: String, required: true, index: true },
    value: { type: Schema.Types.Mixed, required: true },
    source: { type: String, enum: ['ai', 'manual'], required: true },
    confidence: { type: Number, min: 0, max: 1 },
    lineage: { type: ExtractionLineageSchema },
    confirmedAt: { type: Date },
    confirmedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    overwrittenAt: { type: Date },
    overwrittenByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    previousValue: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

AiExtractionFieldSchema.index({ userId: 1, scope: 1, fieldKey: 1 }, { unique: true });

export const AiExtractionFieldModel = mongoose.model<IAiExtractionField>(
  'AiExtractionField',
  AiExtractionFieldSchema
);
