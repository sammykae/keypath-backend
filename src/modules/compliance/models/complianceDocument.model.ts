import mongoose, { Schema, Document } from 'mongoose';

/**
 * Compliance Center backend (P1 - Make Compliance Center Clickable and Add
 * Required Document Types). Deliberately separate from `AgreementModel`
 * (signed_documents) even though 3 of these 10 types overlap with it —
 * Agreement tracks whether a TENANT has signed Lease/RPA/TEPA
 * (NOT_STARTED/SENT/VIEWED/SIGNED/ACTIVE/TERMINATED); this tracks whether the
 * LANDLORD has uploaded/reviewed a compliance copy of a document
 * (Missing/Uploaded/Pending Review/Approved/Rejected/Expired) — a related but
 * distinct concern, same as the two separate campaign systems from the
 * rewards ticket.
 */
export type ComplianceDocumentType =
  | 'LEASE_AGREEMENT'
  | 'RPA_AGREEMENT'
  | 'TEPA_AGREEMENT'
  | 'INSPECTION_REPORT'
  | 'RENTAL_LICENSE'
  | 'PROPERTY_INSURANCE'
  | 'MORTGAGE_DEBT_DOCUMENT'
  | 'PROPERTY_TAX_DOCUMENT'
  | 'CITY_LICENSING_DOCUMENT'
  | 'OTHER_SUPPORTING_DOCUMENT';

export type ComplianceDocumentStatus =
  | 'MISSING' | 'UPLOADED' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export const COMPLIANCE_DOCUMENT_TYPES: ComplianceDocumentType[] = [
  'LEASE_AGREEMENT', 'RPA_AGREEMENT', 'TEPA_AGREEMENT', 'INSPECTION_REPORT',
  'RENTAL_LICENSE', 'PROPERTY_INSURANCE', 'MORTGAGE_DEBT_DOCUMENT',
  'PROPERTY_TAX_DOCUMENT', 'CITY_LICENSING_DOCUMENT', 'OTHER_SUPPORTING_DOCUMENT',
];

export const COMPLIANCE_DOCUMENT_STATUSES: ComplianceDocumentStatus[] = [
  'MISSING', 'UPLOADED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED',
];

/** Document types tied to one specific tenant's tenancy; the rest are property-wide (tenantId null). */
export const TENANT_SCOPED_COMPLIANCE_TYPES: ComplianceDocumentType[] = [
  'LEASE_AGREEMENT', 'RPA_AGREEMENT', 'TEPA_AGREEMENT',
];

export interface IComplianceDocumentFile {
  fileKey: string;
  fileName: string;
  fileType: string;
}

export interface IComplianceDocument extends Document {
  _id: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  tenantId?: mongoose.Types.ObjectId | null;
  documentType: ComplianceDocumentType;
  status: ComplianceDocumentStatus;
  document?: IComplianceDocumentFile | null;
  uploadedAt?: Date | null;
  uploadedBy?: mongoose.Types.ObjectId | null;
  reviewedAt?: Date | null;
  reviewedBy?: mongoose.Types.ObjectId | null;
  rejectionReason?: string | null;
  expiresAt?: Date | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IComplianceDocument>(
  {
    orgId:          { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    propertyId:     { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    tenantId:       { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    documentType:   { type: String, enum: COMPLIANCE_DOCUMENT_TYPES, required: true },
    status:         { type: String, enum: COMPLIANCE_DOCUMENT_STATUSES, default: 'MISSING', index: true },
    document:       { type: { fileKey: String, fileName: String, fileType: String }, default: null },
    uploadedAt:     { type: Date, default: null },
    uploadedBy:     { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt:     { type: Date, default: null },
    reviewedBy:     { type: Schema.Types.ObjectId, ref: 'User', default: null },
    rejectionReason:{ type: String, default: null, maxlength: 1000 },
    expiresAt:      { type: Date, default: null },
    notes:          { type: String, default: null, maxlength: 1000 },
  },
  { timestamps: true, collection: 'compliance_documents' }
);

// One record per property + tenant (null for property-wide types) + document type.
schema.index({ propertyId: 1, tenantId: 1, documentType: 1 }, { unique: true });
schema.index({ orgId: 1, propertyId: 1, status: 1 });

export const ComplianceDocumentModel = mongoose.model<IComplianceDocument>(
  'ComplianceDocument',
  schema
);
