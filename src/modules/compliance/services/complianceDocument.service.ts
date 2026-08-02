import mongoose from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { User } from '../../auth/models/user.model';
import { AuditEvent } from '../../audit/models/audit-log.model';
import { S3Storage } from '../../docs/storage';
import { env } from '../../../core/config/env';
import { resolveLandlordOrgId } from '../../landlord/services/landlordDashboard.service';
import {
  ComplianceDocumentModel,
  IComplianceDocument,
  ComplianceDocumentType,
  ComplianceDocumentStatus,
  COMPLIANCE_DOCUMENT_TYPES,
  TENANT_SCOPED_COMPLIANCE_TYPES,
} from '../models/complianceDocument.model';
import {
  UploadComplianceDocumentInput,
  UpdateComplianceStatusInput,
} from '../dto/complianceDocument.dto';

export interface ComplianceDocumentDTO {
  id: string;
  propertyId: string;
  propertyName: string;
  tenantId: string | null;
  tenantName: string | null;
  documentType: ComplianceDocumentType;
  status: ComplianceDocumentStatus;
  document: { fileKey: string; fileName: string; fileType: string; url: string } | null;
  uploadedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  expiresAt: string | null;
  /** For the "clicking a compliance alert routes to the right screen" requirement — null means "nothing to view yet, go to upload." */
  viewUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

async function resolveFileUrl(key: string): Promise<string> {
  if (!process.env.AWS_S3_BUCKET) {
    return `${env.BACKEND_URL.replace(/\/$/, '')}/api/docs/files/${key}`;
  }
  const s3 = new S3Storage();
  return s3.getSignedUrl(key, 3600);
}

/** An APPROVED document is reported as EXPIRED once its expiresAt has passed — computed, no scheduled job required. */
function resolveEffectiveStatus(d: Pick<IComplianceDocument, 'status' | 'expiresAt'>): ComplianceDocumentStatus {
  if (d.status === 'APPROVED' && d.expiresAt && d.expiresAt.getTime() <= Date.now()) {
    return 'EXPIRED';
  }
  return d.status;
}

async function toDTO(
  d: IComplianceDocument,
  propertyName: string,
  tenantName: string | null
): Promise<ComplianceDocumentDTO> {
  const url = d.document ? await resolveFileUrl(d.document.fileKey) : null;
  return {
    id: d._id.toString(),
    propertyId: d.propertyId.toString(),
    propertyName,
    tenantId: d.tenantId?.toString() ?? null,
    tenantName,
    documentType: d.documentType,
    status: resolveEffectiveStatus(d),
    document: d.document ? { ...d.document, url: url! } : null,
    uploadedAt: d.uploadedAt?.toISOString() ?? null,
    reviewedAt: d.reviewedAt?.toISOString() ?? null,
    rejectionReason: d.rejectionReason ?? null,
    expiresAt: d.expiresAt?.toISOString() ?? null,
    viewUrl: url,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

async function ensureRow(
  orgId: mongoose.Types.ObjectId,
  propertyId: mongoose.Types.ObjectId,
  tenantId: mongoose.Types.ObjectId | null,
  documentType: ComplianceDocumentType
): Promise<IComplianceDocument> {
  const existing = await ComplianceDocumentModel.findOne({ propertyId, tenantId, documentType });
  if (existing) return existing;
  return ComplianceDocumentModel.create({ orgId, propertyId, tenantId, documentType, status: 'MISSING' });
}

async function activeTenantsOnProperty(propertyId: mongoose.Types.ObjectId): Promise<mongoose.Types.ObjectId[]> {
  const units = await UnitModel.find({ propertyId }, '_id').lean();
  const unitIds = units.map((u: any) => u._id);
  const tenancies = await TenancyModel.find({ unitId: { $in: unitIds }, status: 'ACTIVE' }, 'tenantUserId').lean();
  return [...new Set(tenancies.map((t: any) => t.tenantUserId.toString()))].map((id) => new mongoose.Types.ObjectId(id));
}

/** Ensures a MISSING row exists for every required document type on a property (10 property-wide/tenant-scoped rows per active tenant), then returns the full compliance list for that property. */
export async function listComplianceForProperty(
  orgId: string,
  propertyId: string
): Promise<ComplianceDocumentDTO[]> {
  if (!mongoose.Types.ObjectId.isValid(propertyId)) throw new AppError('Invalid propertyId', 400);
  const orgOid = new mongoose.Types.ObjectId(orgId);
  const propertyOid = new mongoose.Types.ObjectId(propertyId);

  const property = await PropertyModel.findOne({ _id: propertyOid, orgId: orgOid }).lean();
  if (!property) throw new AppError('Property not found in your organization', 403);

  const propertyLevelTypes = COMPLIANCE_DOCUMENT_TYPES.filter((t) => !TENANT_SCOPED_COMPLIANCE_TYPES.includes(t));
  const tenantIds = await activeTenantsOnProperty(propertyOid);

  const rows: IComplianceDocument[] = [];
  for (const t of propertyLevelTypes) {
    rows.push(await ensureRow(orgOid, propertyOid, null, t));
  }
  for (const tenantId of tenantIds) {
    for (const t of TENANT_SCOPED_COMPLIANCE_TYPES) {
      rows.push(await ensureRow(orgOid, propertyOid, tenantId, t));
    }
  }

  const tenants = tenantIds.length
    ? await User.find({ _id: { $in: tenantIds } }, 'email profile.firstName profile.lastName').lean()
    : [];
  const tenantById = new Map(tenants.map((u: any) => [u._id.toString(), u]));

  return Promise.all(
    rows.map((r) => {
      const tenant = r.tenantId ? tenantById.get(r.tenantId.toString()) : null;
      const tenantName = tenant
        ? (`${(tenant as any).profile?.firstName ?? ''} ${(tenant as any).profile?.lastName ?? ''}`.trim() || (tenant as any).email)
        : null;
      return toDTO(r, (property as any).name, tenantName);
    })
  );
}

/** Org-wide compliance center view — across every property in the org. */
export async function listComplianceForLandlord(
  landlordUserId: mongoose.Types.ObjectId,
  filter: { propertyId?: string; status?: ComplianceDocumentStatus; documentType?: ComplianceDocumentType } = {}
): Promise<ComplianceDocumentDTO[]> {
  const orgId = await resolveLandlordOrgId(landlordUserId);

  if (filter.propertyId) {
    const rows = await listComplianceForProperty(orgId, filter.propertyId);
    return rows.filter((r) => (!filter.status || r.status === filter.status) && (!filter.documentType || r.documentType === filter.documentType));
  }

  const properties = await PropertyModel.find({ orgId: new mongoose.Types.ObjectId(orgId) }, '_id').lean();
  const all: ComplianceDocumentDTO[] = [];
  for (const p of properties as any[]) {
    const rows = await listComplianceForProperty(orgId, p._id.toString());
    all.push(...rows);
  }
  return all.filter((r) => (!filter.status || r.status === filter.status) && (!filter.documentType || r.documentType === filter.documentType));
}

/** Landlord uploads a document — status becomes UPLOADED (from MISSING or re-upload after REJECTED/EXPIRED). */
export async function uploadComplianceDocument(
  actorUserId: mongoose.Types.ObjectId,
  orgId: string,
  input: UploadComplianceDocumentInput
): Promise<ComplianceDocumentDTO> {
  const orgOid = new mongoose.Types.ObjectId(orgId);
  const propertyOid = new mongoose.Types.ObjectId(input.propertyId);
  const property = await PropertyModel.findOne({ _id: propertyOid, orgId: orgOid }).lean();
  if (!property) throw new AppError('Property not found in your organization', 403);

  const isTenantScoped = (TENANT_SCOPED_COMPLIANCE_TYPES as string[]).includes(input.documentType);
  if (isTenantScoped && !input.tenantId) {
    throw new AppError(`${input.documentType} requires a tenantId`, 400);
  }
  const tenantOid = input.tenantId ? new mongoose.Types.ObjectId(input.tenantId) : null;

  let doc = await ComplianceDocumentModel.findOne({ propertyId: propertyOid, tenantId: tenantOid, documentType: input.documentType });
  if (!doc) {
    doc = await ComplianceDocumentModel.create({
      orgId: orgOid, propertyId: propertyOid, tenantId: tenantOid, documentType: input.documentType, status: 'MISSING',
    });
  }

  doc.document = input.document;
  doc.status = 'UPLOADED';
  doc.uploadedAt = new Date();
  doc.uploadedBy = actorUserId;
  doc.reviewedAt = null;
  doc.reviewedBy = null;
  doc.rejectionReason = null;
  if (input.expiresAt) doc.expiresAt = input.expiresAt;
  await doc.save();

  AuditEvent.create({
    actorUserId, orgId: orgOid,
    action: input.documentType === 'MORTGAGE_DEBT_DOCUMENT' ? 'DEBT_DOCUMENT_UPLOADED' : 'COMPLIANCE_DOCUMENT_UPLOADED',
    entityType: 'ComplianceDocument', entityId: doc._id, source: 'user', updateType: 'manual',
    propertyId: propertyOid, tenantId: tenantOid ?? undefined,
    metadata: { documentType: input.documentType },
  }).catch(() => {});

  const tenant = tenantOid ? await User.findById(tenantOid, 'email profile.firstName profile.lastName').lean() : null;
  const tenantName = tenant
    ? (`${(tenant as any).profile?.firstName ?? ''} ${(tenant as any).profile?.lastName ?? ''}`.trim() || (tenant as any).email)
    : null;
  return toDTO(doc, (property as any).name, tenantName);
}

/** Landlord/admin reviews a document: PENDING_REVIEW, APPROVED (records reviewer), REJECTED (requires a reason), or manually EXPIRED. */
export async function updateComplianceStatus(
  actorUserId: mongoose.Types.ObjectId,
  orgId: string,
  id: string,
  input: UpdateComplianceStatusInput
): Promise<ComplianceDocumentDTO> {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError('Invalid document id', 400);
  const doc = await ComplianceDocumentModel.findOne({ _id: new mongoose.Types.ObjectId(id), orgId: new mongoose.Types.ObjectId(orgId) });
  if (!doc) throw new AppError('Compliance document not found', 404);
  if (input.status === 'REJECTED' && !input.rejectionReason) {
    throw new AppError('rejectionReason is required when rejecting', 400);
  }

  const before = doc.status;
  doc.status = input.status;
  if (input.status === 'APPROVED') {
    doc.reviewedAt = new Date();
    doc.reviewedBy = actorUserId;
    doc.rejectionReason = null;
  }
  if (input.status === 'REJECTED') {
    doc.reviewedAt = new Date();
    doc.reviewedBy = actorUserId;
    doc.rejectionReason = input.rejectionReason ?? null;
  }
  if (input.expiresAt) doc.expiresAt = input.expiresAt;
  await doc.save();

  const statusAction =
    input.status === 'APPROVED' ? 'COMPLIANCE_DOCUMENT_APPROVED' :
    input.status === 'REJECTED' ? 'COMPLIANCE_DOCUMENT_REJECTED' :
    'COMPLIANCE_STATUS_CHANGED';

  AuditEvent.create({
    actorUserId, orgId: doc.orgId, action: statusAction,
    entityType: 'ComplianceDocument', entityId: doc._id, source: 'user', updateType: 'manual',
    propertyId: doc.propertyId, tenantId: doc.tenantId ?? undefined,
    metadata: input.status === 'REJECTED' ? { rejectionReason: doc.rejectionReason } : undefined,
    diff: { before: { status: before }, after: { status: input.status } },
  }).catch(() => {});

  const property = await PropertyModel.findById(doc.propertyId, 'name').lean();
  const tenant = doc.tenantId ? await User.findById(doc.tenantId, 'email profile.firstName profile.lastName').lean() : null;
  const tenantName = tenant
    ? (`${(tenant as any).profile?.firstName ?? ''} ${(tenant as any).profile?.lastName ?? ''}`.trim() || (tenant as any).email)
    : null;
  return toDTO(doc, (property as any)?.name ?? '', tenantName);
}

export interface ComplianceAggregation {
  totalDocuments: number;
  byStatus: Record<ComplianceDocumentStatus, number>;
}

/** Compliance status aggregation — counts by status, org-wide or for one property. */
export async function getComplianceAggregation(
  landlordUserId: mongoose.Types.ObjectId,
  propertyId?: string
): Promise<ComplianceAggregation> {
  const rows = await listComplianceForLandlord(landlordUserId, { propertyId });
  const byStatus: Record<ComplianceDocumentStatus, number> = {
    MISSING: 0, UPLOADED: 0, PENDING_REVIEW: 0, APPROVED: 0, REJECTED: 0, EXPIRED: 0,
  };
  for (const r of rows) byStatus[r.status]++;
  return { totalDocuments: rows.length, byStatus };
}

export async function getComplianceDocumentFile(
  landlordUserId: mongoose.Types.ObjectId,
  id: string
): Promise<{ url: string; fileName: string }> {
  const orgId = await resolveLandlordOrgId(landlordUserId);
  if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError('Invalid document id', 400);
  const doc = await ComplianceDocumentModel.findOne({ _id: new mongoose.Types.ObjectId(id), orgId: new mongoose.Types.ObjectId(orgId) }).lean();
  if (!doc || !(doc as any).document) throw new AppError('No document uploaded for this record', 404);
  const file = (doc as any).document;
  return { url: await resolveFileUrl(file.fileKey), fileName: file.fileName };
}
