import mongoose, { Schema, Document } from 'mongoose';

export const DocumentStatus = {
  PROCESSING: 'PROCESSING',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export type DocumentStatusType = (typeof DocumentStatus)[keyof typeof DocumentStatus];

const DOCUMENT_STATUS_VALUES = Object.values(DocumentStatus);

export interface IDocument extends Document {
  docId: string;
  orgId: mongoose.Types.ObjectId;
  uploaderUserId: mongoose.Types.ObjectId;
  fileKey: string;
  type: string;
  status: string;
  error?: string;
  propertyId?: mongoose.Types.ObjectId;
  unitId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt?: Date;
}

const DocumentSchema = new Schema<IDocument>(
  {
    docId: { type: String, required: true, unique: true, index: true },
    orgId: { type: Schema.Types.ObjectId, required: true, ref: 'Organization', index: true },
    uploaderUserId: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    fileKey: { type: String, required: true, index: true },
    type: { type: String, required: true, index: true },
    status: { type: String, required: true, enum: DOCUMENT_STATUS_VALUES, index: true },
    error: { type: String, required: false },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', index: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', index: true },
  },
  { timestamps: true, collection: 'document_uploads' }
);

export const DocumentModel = mongoose.model<IDocument>('Document', DocumentSchema);
