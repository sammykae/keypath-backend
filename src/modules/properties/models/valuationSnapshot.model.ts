import mongoose, { Schema, Document } from 'mongoose';

/**
 * Annual valuation history for a property (Backend Canon: valuationSnapshots).
 * Drives Current Token Value / Economic Participation % on the tenant TEPA
 * card and the landlord's Annual Valuation Status — this collection didn't
 * exist before; only a single static Property.valuationUsd field did, with
 * no history, date, method, or source.
 */
export type ValuationMethod = 'APPRAISAL' | 'BPO' | 'AVM';
export type ValuationSource = 'MANUAL' | 'ZILLOW' | 'REDFIN' | 'CORELOGIC' | 'OTHER';

export const VALUATION_METHODS: ValuationMethod[] = ['APPRAISAL', 'BPO', 'AVM'];
export const VALUATION_SOURCES: ValuationSource[] = ['MANUAL', 'ZILLOW', 'REDFIN', 'CORELOGIC', 'OTHER'];

export interface IValuationSnapshot extends Document {
  _id: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  valuationUsd: number;
  method: ValuationMethod;
  source: ValuationSource;
  effectiveDate: Date;
  notes?: string | null;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IValuationSnapshot>(
  {
    orgId:         { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    propertyId:    { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    valuationUsd:  { type: Number, required: true, min: 0 },
    method:        { type: String, enum: VALUATION_METHODS, required: true },
    source:        { type: String, enum: VALUATION_SOURCES, required: true, default: 'MANUAL' },
    effectiveDate: { type: Date, required: true, index: true },
    notes:         { type: String, default: null, maxlength: 1000 },
    createdBy:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'valuation_snapshots' }
);

schema.index({ propertyId: 1, effectiveDate: -1 });

export const ValuationSnapshotModel = mongoose.model<IValuationSnapshot>(
  'ValuationSnapshot',
  schema
);
