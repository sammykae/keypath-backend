import mongoose, { Schema, Document } from 'mongoose';

export interface Unit extends Document {
  _id: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  unitNumber: string;
  bedrooms: number;
  bathrooms: number;
  rent: number;
  status: 'VACANT' | 'OCCUPIED' | 'TURN' | 'OFFLINE';
  label?: string;
  squareFootage?: number;
  marketRent?: number;
  scheduledRent?: number;
  tenantId?: mongoose.Types.ObjectId;
  normalizedName?: string;
  searchKeywords?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const UnitSchema = new Schema<Unit>(
  {
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    unitNumber: { type: String, required: true },
    bedrooms: { type: Number, required: true, min: 0 },
    bathrooms: { type: Number, required: true, min: 0 },
    rent: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['VACANT', 'OCCUPIED', 'TURN', 'OFFLINE'],
      required: true,
      default: 'VACANT'
    },
    label: { type: String },
    squareFootage: { type: Number, min: 0 },
    marketRent: { type: Number, min: 0 },
    scheduledRent: { type: Number, min: 0 },

    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', index: true, sparse: true },

    normalizedName: { type: String, index: true },
    searchKeywords: { type: [String], default: [] },
  },
  { timestamps: true }
);

// Indexes as specified in guide
UnitSchema.index({ propertyId: 1, status: 1 });
// Unique index to prevent duplicate unit numbers within a property
UnitSchema.index({ propertyId: 1, unitNumber: 1 }, { unique: true });

UnitSchema.pre('save', function (next) {
  if (this.isModified('unitNumber') || this.isModified('label') || !this.normalizedName) {
    const numLower = (this.unitNumber as string).toLowerCase().trim();
    this.normalizedName = `unit ${numLower}`;
    const parts = ['unit', numLower, ...numLower.split(/[\s\-\/]+/).filter(Boolean)];
    if (this.label) {
      const labelLower = (this.label as string).toLowerCase().trim();
      parts.push(...labelLower.split(/\s+/).filter(Boolean));
    }
    this.searchKeywords = [...new Set(parts)];
  }
  next();
});

UnitSchema.index({ normalizedName: 'text', searchKeywords: 'text' });

import { upsertUnitEntry } from '../../search-index/services/search-index.service';
UnitSchema.post('save', function (doc) {
  upsertUnitEntry(doc.toObject()).catch((err) => {
    console.error('[SearchIndex] unit upsert failed:', err.message);
  });
});

export const UnitModel = mongoose.model<Unit>('Unit', UnitSchema);
