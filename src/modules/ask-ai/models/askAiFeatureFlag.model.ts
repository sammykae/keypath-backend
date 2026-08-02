import mongoose, { Schema, Document } from 'mongoose';

// Single-document runtime flag key for Ask AI availability.
export const ASK_AI_FEATURE_FLAG_NAME = 'ask_ai_enabled';

export interface AskAiFeatureFlag extends Document {
  _id: mongoose.Types.ObjectId;
  name: typeof ASK_AI_FEATURE_FLAG_NAME;
  enabled: boolean;
  updatedByUserId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const askAiFeatureFlagSchema = new Schema<AskAiFeatureFlag>(
  {
    name: {
      type: String,
      enum: [ASK_AI_FEATURE_FLAG_NAME],
      required: true,
      unique: true,
      index: true,
      default: ASK_AI_FEATURE_FLAG_NAME,
    },
    // Global on/off switch value used by Ask AI middleware.
    enabled: { type: Boolean, required: true, default: true },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const AskAiFeatureFlagModel = mongoose.model<AskAiFeatureFlag>(
  'AskAiFeatureFlag',
  askAiFeatureFlagSchema
);
