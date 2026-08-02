import { Schema, model, HydratedDocument, Types } from 'mongoose';

export type SearchIndexType = 'tenant' | 'property' | 'unit';

export interface ISearchIndex {
  type: SearchIndexType;
  entityId: Types.ObjectId;
  label: string;
  subLabel?: string;
  keywords: string[];
  route: string;
  // Access scope — mutually exclusive: orgId entries cover properties/units; invitedByUserId covers tenants
  orgId?: Types.ObjectId;
  invitedByUserId?: Types.ObjectId;
  // Denormalized refs for downstream use
  propertyId?: Types.ObjectId;
  unitId?: Types.ObjectId;
  tenantId?: Types.ObjectId;
  roleAccess: string[];
  createdAt: Date;
  updatedAt: Date;
}

const SearchIndexSchema = new Schema<ISearchIndex>(
  {
    type: { type: String, enum: ['tenant', 'property', 'unit'], required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    label: { type: String, required: true },
    subLabel: { type: String },
    keywords: { type: [String], default: [] },
    route: { type: String, required: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', index: true, sparse: true },
    invitedByUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true, sparse: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', sparse: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', sparse: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', sparse: true },
    roleAccess: { type: [String], default: [] },
  },
  { timestamps: true }
);

// Unique constraint: one index entry per entity
SearchIndexSchema.index({ entityId: 1, type: 1 }, { unique: true });

// Primary search indexes (prefix regex on keywords array uses this)
SearchIndexSchema.index({ orgId: 1, keywords: 1 });
SearchIndexSchema.index({ invitedByUserId: 1, keywords: 1 });

// Text index for full-word $text queries (supplementary)
SearchIndexSchema.index({ keywords: 'text', label: 'text' });

export type SearchIndexDocument = HydratedDocument<ISearchIndex>;
export const SearchIndexModel = model<ISearchIndex>('SearchIndex', SearchIndexSchema);
