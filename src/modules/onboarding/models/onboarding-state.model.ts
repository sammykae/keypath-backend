import { Schema, model, Types } from 'mongoose';

export type OnboardingStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE';
export type OnboardingDocumentStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

// Codex: onboarding documents are tracked in-state to support manual verification flow.
export interface IOnboardingDocument {
  documentId: string;
  stepKey: string;
  documentType: string;
  fileName?: string;
  fileUrl: string;
  status: OnboardingDocumentStatus;
  uploadedAt: Date;
  reviewedByUserId?: Types.ObjectId;
  reviewedAt?: Date;
  rejectionReason?: string;
}

export interface IOnboardingState {
  userId: Types.ObjectId;
  role: string;
  completedSteps: string[];
  stepData: Record<string, unknown>;
  documents: IOnboardingDocument[];
  status: OnboardingStatus;
  updatedAt: Date;
}

const OnboardingDocumentSchema = new Schema<IOnboardingDocument>(
  {
    documentId: { type: String, required: true },
    stepKey: { type: String, required: true },
    documentType: { type: String, required: true },
    fileName: { type: String },
    fileUrl: { type: String, required: true },
    status: {
      type: String,
      enum: ['PENDING', 'VERIFIED', 'REJECTED'],
      default: 'PENDING',
      required: true,
    },
    uploadedAt: { type: Date, required: true },
    reviewedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    rejectionReason: { type: String },
  },
  { _id: false }
);

const OnboardingStateSchema = new Schema<IOnboardingState>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', unique: true },
    role: { type: String, required: true },
    completedSteps: { type: [String], default: [] },
    // Codex: stores arbitrary per-step payload captured by submit-step endpoint.
    stepData: { type: Schema.Types.Mixed, default: {} },
    documents: { type: [OnboardingDocumentSchema], default: [] },
    status: {
      type: String,
      enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE'],
      default: 'NOT_STARTED',
    },
  },
  { timestamps: true }
);

export const OnboardingState = model<IOnboardingState>(
  'OnboardingState',
  OnboardingStateSchema
);
