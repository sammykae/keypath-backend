import mongoose, { Schema, Document } from 'mongoose';

/**
 * Unified agreement/document status tracking for Lease, RPA, and TEPA
 * (Backend Canon: signedDocuments). Before this, signing status was
 * fragmented across Tenancy.status, TenantInviteModel, TenantParticipationModel
 * enrollment fields, and TepaEnrollment — none of which tracked a signed file,
 * a sent/viewed/signed lifecycle, or an effective date in one place.
 */
export type AgreementType = 'LEASE' | 'RPA' | 'TEPA';
export type AgreementStatus = 'NOT_STARTED' | 'SENT' | 'VIEWED' | 'SIGNED' | 'ACTIVE' | 'TERMINATED';

export const AGREEMENT_TYPES: AgreementType[] = ['LEASE', 'RPA', 'TEPA'];
export const AGREEMENT_STATUSES: AgreementStatus[] = [
  'NOT_STARTED', 'SENT', 'VIEWED', 'SIGNED', 'ACTIVE', 'TERMINATED',
];

export interface IAgreementDocumentFile {
  fileKey: string;
  fileName: string;
  fileType: string;
}

export interface IAgreement extends Document {
  _id: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  unitId?: mongoose.Types.ObjectId | null;
  tenantUserId: mongoose.Types.ObjectId;
  tenancyId?: mongoose.Types.ObjectId | null;
  agreementType: AgreementType;
  status: AgreementStatus;
  document?: IAgreementDocumentFile | null;
  sentAt?: Date | null;
  viewedAt?: Date | null;
  signedAt?: Date | null;
  effectiveDate?: Date | null;
  terminatedAt?: Date | null;
  uploadedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IAgreement>(
  {
    orgId:         { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    propertyId:    { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    unitId:        { type: Schema.Types.ObjectId, ref: 'Unit', default: null, index: true },
    tenantUserId:  { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tenancyId:     { type: Schema.Types.ObjectId, ref: 'Tenancy', default: null, index: true },
    agreementType: { type: String, enum: AGREEMENT_TYPES, required: true },
    status:        { type: String, enum: AGREEMENT_STATUSES, default: 'NOT_STARTED', index: true },
    document:      { type: { fileKey: String, fileName: String, fileType: String }, default: null },
    sentAt:        { type: Date, default: null },
    viewedAt:      { type: Date, default: null },
    signedAt:      { type: Date, default: null },
    effectiveDate: { type: Date, default: null },
    terminatedAt:  { type: Date, default: null },
    uploadedBy:    { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'signed_documents' }
);

// One agreement record per tenant + type (+ unit, for multi-unit tenants) — updated in place as status progresses.
schema.index({ tenantUserId: 1, unitId: 1, agreementType: 1 }, { unique: true });
schema.index({ orgId: 1, propertyId: 1, agreementType: 1, status: 1 });

export const AgreementModel = mongoose.model<IAgreement>('Agreement', schema);
