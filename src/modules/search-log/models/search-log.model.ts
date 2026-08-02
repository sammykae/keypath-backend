import { Schema, model, HydratedDocument, Types } from 'mongoose';

export interface IClickedResult {
  resultType: string;
  label: string;
  route: string;
  rank: number;
}

export interface ISearchLog {
  userId: Types.ObjectId;
  query: string;
  role: string;
  resultsCount: number;
  clickedResult?: IClickedResult;
  timestamp: Date;
}

const SearchLogSchema = new Schema<ISearchLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    query: { type: String, required: true, trim: true },
    role: { type: String, required: true },
    resultsCount: { type: Number, required: true, min: 0 },
    clickedResult: {
      resultType: { type: String },
      label: { type: String },
      route: { type: String },
      rank: { type: Number },
    },
    timestamp: { type: Date, default: () => new Date() },
  },
  { timestamps: false }
);

// Fast lookups for analytics
SearchLogSchema.index({ userId: 1, timestamp: -1 });
SearchLogSchema.index({ query: 1, timestamp: -1 });
SearchLogSchema.index({ timestamp: -1 });

// Auto-expire logs after 90 days
SearchLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export type SearchLogDocument = HydratedDocument<ISearchLog>;
export const SearchLogModel = model<ISearchLog>('SearchLog', SearchLogSchema);
