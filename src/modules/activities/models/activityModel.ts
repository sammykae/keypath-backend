import mongoose, { Schema, Document } from 'mongoose';

export interface Activity extends Document {
  _id: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  entity: {
    type: string;
    id: mongoose.Types.ObjectId;
  };
  actorId: mongoose.Types.ObjectId;
  action: string;
  meta: Record<string, any>;
  createdAt: Date;
}

const activitySchema = new Schema<Activity>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    entity: {
      type: { type: String, required: true },
      id: { type: Schema.Types.ObjectId, required: true, index: true }
    },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    meta: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, required: true, default: Date.now, index: true }
  },
  { timestamps: false }
);

// Indexes as specified in guide
activitySchema.index({ orgId: 1, 'entity.id': 1, createdAt: -1 });

export const ActivityModel = mongoose.model<Activity>('Activity', activitySchema);

