import mongoose, { Schema, Document } from 'mongoose';

export interface Waterfall extends Document {
  _id: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  propertyId?: mongoose.Types.ObjectId; // null = portfolio level
  prefReturnPct: number;
  promoteTiers: Array<{
    hurdleIRR: number;
    gpPct: number;
    lpPct: number;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const promoteTierSchema = new Schema(
  {
    hurdleIRR: { type: Number, required: true, min: 0 },
    gpPct: { type: Number, required: true, min: 0, max: 100 },
    lpPct: { type: Number, required: true, min: 0, max: 100 }
  },
  { _id: false }
);

const waterfallSchema = new Schema<Waterfall>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', index: true },
    prefReturnPct: { type: Number, required: true, min: 0, max: 100 },
    promoteTiers: { type: [promoteTierSchema], required: true, default: [] }
  },
  { timestamps: true }
);

// Indexes as specified in guide
waterfallSchema.index({ orgId: 1, propertyId: 1 });

export const WaterfallModel = mongoose.model<Waterfall>('Waterfall', waterfallSchema);

