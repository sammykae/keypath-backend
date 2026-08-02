import mongoose, { Schema, Document } from 'mongoose';

export interface TokenizationConfig extends Document {
  _id: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  entity: 'SERIES_LLC' | 'TRUST' | 'OTHER';
  equityPct: number;
  accrualRate: number;
  bonusRules: string;
  rofr: boolean;
  holdPeriodMonths: number;
  network: 'none' | 'Polygon' | 'Base';
  createdAt: Date;
  updatedAt: Date;
}

const tokenizationConfigSchema = new Schema<TokenizationConfig>(
  {
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    entity: { 
      type: String, 
      enum: ['SERIES_LLC', 'TRUST', 'OTHER'], 
      required: true 
    },
    equityPct: { type: Number, required: true, min: 0, max: 100 },
    accrualRate: { type: Number, required: true, min: 0 },
    bonusRules: { type: String, required: true },
    rofr: { type: Boolean, required: true, default: false },
    holdPeriodMonths: { type: Number, required: true, min: 0, default: 0 },
    network: { 
      type: String, 
      enum: ['none', 'Polygon', 'Base'], 
      required: true,
      default: 'none'
    }
  },
  { timestamps: true }
);

export const TokenizationConfigModel = mongoose.model<TokenizationConfig>('TokenizationConfig', tokenizationConfigSchema);

