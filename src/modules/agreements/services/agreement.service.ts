import mongoose from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { User } from '../../auth/models/user.model';
import { AuditEvent } from '../../audit/models/audit-log.model';
import { notify } from '../../notifications/services/notification.service';
import { S3Storage } from '../../docs/storage';
import { env } from '../../../core/config/env';
import { resolveLandlordOrgId } from '../../landlord/services/landlordDashboard.service';
import {
  AgreementModel,
  IAgreement,
  AgreementType,
  AgreementStatus,
} from '../models/agreement.model';

export interface AgreementDTO {
  id: string;
  agreementType: AgreementType;
  status: AgreementStatus;
  tenantUserId: string;
  propertyId: string;
  unitId: string | null;
  document: { fileKey: string; fileName: string; fileType: string; url: string } | null;
  sentAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  effectiveDate: string | null;
  terminatedAt: string | null;
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

/** A SIGNED agreement is only reported as ACTIVE once its effectiveDate has actually arrived — computed, never a stored mutation a scheduler has to run. */
function resolveEffectiveStatus(a: Pick<IAgreement, 'status' | 'effectiveDate'>): AgreementStatus {
  if (a.status === 'SIGNED' && a.effectiveDate && a.effectiveDate.getTime() <= Date.now()) {
    return 'ACTIVE';
  }
  return a.status;
}

async function toDTO(a: IAgreement): Promise<AgreementDTO> {
  return {
    id: a._id.toString(),
    agreementType: a.agreementType,
    status: resolveEffectiveStatus(a),
    tenantUserId: a.tenantUserId.toString(),
    propertyId: a.propertyId.toString(),
    unitId: a.unitId?.toString() ?? null,
    document: a.document
      ? { ...a.document, url: await resolveFileUrl(a.document.fileKey) }
      : null,
    sentAt: a.sentAt?.toISOString() ?? null,
    viewedAt: a.viewedAt?.toISOString() ?? null,
    signedAt: a.signedAt?.toISOString() ?? null,
    effectiveDate: a.effectiveDate?.toISOString() ?? null,
    terminatedAt: a.terminatedAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

async function getTenantActiveTenancyContext(tenantUserId: mongoose.Types.ObjectId) {
  const tenancy = await TenancyModel.findOne({
    tenantUserId,
    status: { $in: ['ACTIVE', 'PENDING'] },
  }).sort({ updatedAt: -1 }).lean();
  if (!tenancy) throw new AppError('No active tenancy found', 404);

  const unit = await UnitModel.findById((tenancy as any).unitId).lean();
  if (!unit) throw new AppError('Unit not found', 404);
  const property = await PropertyModel.findById((unit as any).propertyId).lean();
  if (!property) throw new AppError('Property not found', 404);

  return { tenancy: tenancy as any, unit: unit as any, property: property as any };
}

/** Which agreement types apply to this tenancy's participation model. Lease always applies. */
function applicableTypes(participationModel: string | undefined): AgreementType[] {
  const types: AgreementType[] = ['LEASE'];
  if (participationModel === 'RPA_ONLY' || participationModel === 'BOTH') types.push('RPA');
  if (participationModel === 'TEPA_ONLY' || participationModel === 'BOTH') types.push('TEPA');
  return types;
}

async function ensureAgreement(
  orgId: mongoose.Types.ObjectId,
  propertyId: mongoose.Types.ObjectId,
  unitId: mongoose.Types.ObjectId,
  tenantUserId: mongoose.Types.ObjectId,
  tenancyId: mongoose.Types.ObjectId,
  agreementType: AgreementType
): Promise<IAgreement> {
  const existing = await AgreementModel.findOne({ tenantUserId, unitId, agreementType });
  if (existing) return existing;
  return AgreementModel.create({
    orgId, propertyId, unitId, tenantUserId, tenancyId, agreementType, status: 'NOT_STARTED',
  });
}

/** Tenant's own document screen: Lease always shown; RPA/TEPA only "if applicable" to their participation model. */
export async function getTenantAgreements(tenantUserId: mongoose.Types.ObjectId): Promise<AgreementDTO[]> {
  const { tenancy, unit, property } = await getTenantActiveTenancyContext(tenantUserId);
  const types = applicableTypes(property.participationModel);

  const agreements = await Promise.all(
    types.map((t) =>
      ensureAgreement(property.orgId, property._id, unit._id, tenantUserId, tenancy._id, t)
    )
  );
  return Promise.all(agreements.map(toDTO));
}

/** Tenant views their own document — auto-transitions SENT -> VIEWED, records viewedAt. */
export async function getAgreementForTenant(
  tenantUserId: mongoose.Types.ObjectId,
  agreementId: string
): Promise<AgreementDTO> {
  if (!mongoose.Types.ObjectId.isValid(agreementId)) throw new AppError('Invalid agreement id', 400);
  const agreement = await AgreementModel.findOne({ _id: new mongoose.Types.ObjectId(agreementId), tenantUserId });
  if (!agreement) throw new AppError('Agreement not found', 404);

  if (agreement.status === 'SENT' || agreement.status === 'NOT_STARTED') {
    agreement.status = agreement.status === 'NOT_STARTED' ? agreement.status : 'VIEWED';
    if (!agreement.viewedAt) agreement.viewedAt = new Date();
    await agreement.save();
  }

  return toDTO(agreement);
}

async function assertPropertyInOrg(propertyId: string, orgId: mongoose.Types.ObjectId): Promise<void> {
  const exists = await PropertyModel.exists({ _id: new mongoose.Types.ObjectId(propertyId), orgId });
  if (!exists) throw new AppError('Property not found in your organization', 403);
}

export interface UploadAgreementInput {
  tenantUserId: string;
  propertyId: string;
  unitId: string;
  agreementType: AgreementType;
  document: { fileKey: string; fileName: string; fileType: string };
  effectiveDate?: Date;
  signedAt?: Date;
}

/** Landlord uploads a signed document — status becomes SIGNED (or ACTIVE if the effective date has already arrived). */
export async function uploadSignedAgreement(
  landlordUserId: mongoose.Types.ObjectId,
  orgId: string,
  input: UploadAgreementInput
): Promise<AgreementDTO> {
  const orgOid = new mongoose.Types.ObjectId(orgId);
  await assertPropertyInOrg(input.propertyId, orgOid);

  if (!mongoose.Types.ObjectId.isValid(input.tenantUserId)) throw new AppError('Invalid tenantUserId', 400);
  const tenantOid = new mongoose.Types.ObjectId(input.tenantUserId);
  const unitOid = new mongoose.Types.ObjectId(input.unitId);

  const tenancy = await TenancyModel.findOne({ tenantUserId: tenantOid, unitId: unitOid }).sort({ updatedAt: -1 }).lean();
  if (!tenancy) throw new AppError('Tenant does not have a tenancy on this unit', 404);

  let agreement = await AgreementModel.findOne({ tenantUserId: tenantOid, unitId: unitOid, agreementType: input.agreementType });
  const previousStatus = agreement?.status ?? null;
  const signedAt = input.signedAt ?? new Date();
  const effectiveDate = input.effectiveDate ?? signedAt;

  if (!agreement) {
    agreement = await AgreementModel.create({
      orgId: orgOid,
      propertyId: new mongoose.Types.ObjectId(input.propertyId),
      unitId: unitOid,
      tenantUserId: tenantOid,
      tenancyId: (tenancy as any)._id,
      agreementType: input.agreementType,
      status: 'SIGNED',
      document: input.document,
      signedAt,
      effectiveDate,
      uploadedBy: landlordUserId,
    });
  } else {
    agreement.document = input.document;
    agreement.status = 'SIGNED';
    agreement.signedAt = signedAt;
    agreement.effectiveDate = effectiveDate;
    agreement.uploadedBy = landlordUserId;
    await agreement.save();
  }

  AuditEvent.create({
    actorUserId: landlordUserId,
    orgId: orgOid,
    action: 'AGREEMENT_UPLOADED',
    entityType: 'Agreement',
    entityId: agreement._id,
    source: 'user',
    updateType: 'manual',
    propertyId: agreement.propertyId,
    tenantId: tenantOid,
    metadata: { agreementType: input.agreementType },
    diff: { before: { status: previousStatus }, after: { status: agreement.status } },
  }).catch(() => {});

  if (input.agreementType === 'RPA' || input.agreementType === 'TEPA') {
    notify({
      recipientId: tenantOid,
      recipientRole: 'tenant',
      landlordId: landlordUserId,
      propertyId: agreement.propertyId,
      unitId: unitOid,
      tenantId: tenantOid,
      eventType: input.agreementType === 'RPA' ? 'RPA_SIGNED' : 'TEPA_SIGNED',
      eventTitle: input.agreementType === 'RPA' ? 'RPA signed' : 'TEPA signed',
      eventDescription: `Your ${input.agreementType} agreement is now ${resolveEffectiveStatus(agreement).toLowerCase()}.`,
    });
  }

  return toDTO(agreement);
}

export interface UpdateAgreementStatusInput {
  status: Extract<AgreementStatus, 'SENT' | 'TERMINATED'>;
}

/** Landlord manually transitions status — SENT (invite dispatched, no document yet) or TERMINATED. */
export async function updateAgreementStatus(
  landlordUserId: mongoose.Types.ObjectId,
  orgId: string,
  agreementId: string,
  input: UpdateAgreementStatusInput
): Promise<AgreementDTO> {
  if (!mongoose.Types.ObjectId.isValid(agreementId)) throw new AppError('Invalid agreement id', 400);
  const agreement = await AgreementModel.findOne({
    _id: new mongoose.Types.ObjectId(agreementId),
    orgId: new mongoose.Types.ObjectId(orgId),
  });
  if (!agreement) throw new AppError('Agreement not found', 404);

  const before = agreement.status;
  agreement.status = input.status;
  if (input.status === 'SENT' && !agreement.sentAt) agreement.sentAt = new Date();
  if (input.status === 'TERMINATED') agreement.terminatedAt = new Date();
  await agreement.save();

  AuditEvent.create({
    actorUserId: landlordUserId,
    orgId: agreement.orgId,
    action: 'AGREEMENT_STATUS_CHANGED',
    entityType: 'Agreement',
    entityId: agreement._id,
    source: 'user',
    updateType: 'manual',
    propertyId: agreement.propertyId,
    tenantId: agreement.tenantUserId,
    diff: { before: { status: before }, after: { status: input.status } },
  }).catch(() => {});

  return toDTO(agreement);
}

export interface LandlordAgreementRow extends AgreementDTO {
  tenantName: string;
  tenantEmail: string;
  propertyName: string;
  unitNumber: string;
}

/** Core org-scoped query, reused by the landlord path (which resolves orgId via membership) and the PM path (which resolves orgId via assignment). */
export async function listAgreementsForOrg(
  orgId: string,
  filter: { propertyId?: string; unitId?: string; tenantUserId?: string; agreementType?: AgreementType } = {}
): Promise<LandlordAgreementRow[]> {
  const orgOid = new mongoose.Types.ObjectId(orgId);

  const query: any = { orgId: orgOid };
  if (filter.propertyId) query.propertyId = new mongoose.Types.ObjectId(filter.propertyId);
  if (filter.unitId) query.unitId = new mongoose.Types.ObjectId(filter.unitId);
  if (filter.tenantUserId) query.tenantUserId = new mongoose.Types.ObjectId(filter.tenantUserId);
  if (filter.agreementType) query.agreementType = filter.agreementType;

  const rows = await AgreementModel.find(query).sort({ updatedAt: -1 }).limit(500);

  const tenantIds = [...new Set(rows.map((r) => r.tenantUserId.toString()))];
  const propertyIds = [...new Set(rows.map((r) => r.propertyId.toString()))];
  const unitIds = [...new Set(rows.filter((r) => r.unitId).map((r) => r.unitId!.toString()))];

  const [tenants, properties, units] = await Promise.all([
    User.find({ _id: { $in: tenantIds } }, 'email profile.firstName profile.lastName').lean(),
    PropertyModel.find({ _id: { $in: propertyIds } }, 'name').lean(),
    UnitModel.find({ _id: { $in: unitIds } }, 'unitNumber').lean(),
  ]);
  const tenantById = new Map(tenants.map((u: any) => [u._id.toString(), u]));
  const propertyById = new Map(properties.map((p: any) => [p._id.toString(), p]));
  const unitById = new Map(units.map((u: any) => [u._id.toString(), u]));

  const dtos = await Promise.all(rows.map(toDTO));
  return dtos.map((dto, i) => {
    const row = rows[i];
    const tenant = tenantById.get(row.tenantUserId.toString());
    const name = tenant
      ? (`${(tenant as any).profile?.firstName ?? ''} ${(tenant as any).profile?.lastName ?? ''}`.trim() || (tenant as any).email)
      : '';
    return {
      ...dto,
      tenantName: name,
      tenantEmail: (tenant as any)?.email ?? '',
      propertyName: propertyById.get(row.propertyId.toString())?.name ?? '',
      unitNumber: row.unitId ? (unitById.get(row.unitId.toString())?.unitNumber ?? '') : '',
    };
  });
}

/** Landlord's agreement status screen — which tenants have signed RPA/TEPA/Lease, and which haven't, by property/unit. */
export async function listAgreementsForLandlord(
  landlordUserId: mongoose.Types.ObjectId,
  filter: { propertyId?: string; unitId?: string; tenantUserId?: string; agreementType?: AgreementType } = {}
): Promise<LandlordAgreementRow[]> {
  const orgId = await resolveLandlordOrgId(landlordUserId);
  return listAgreementsForOrg(orgId, filter);
}

/** Authoritative check for the ticket's acceptance criterion: TEPA features must not show active unless the TEPA agreement itself is signed/active. */
export async function isTepaAgreementActive(
  tenantUserId: mongoose.Types.ObjectId,
  unitId: mongoose.Types.ObjectId
): Promise<boolean> {
  const agreement = await AgreementModel.findOne({ tenantUserId, unitId, agreementType: 'TEPA' }).lean();
  if (!agreement) return false;
  return resolveEffectiveStatus(agreement as any) === 'ACTIVE';
}

export async function getAgreementFileForLandlord(
  landlordUserId: mongoose.Types.ObjectId,
  agreementId: string
): Promise<{ url: string; fileName: string }> {
  const orgId = await resolveLandlordOrgId(landlordUserId);
  if (!mongoose.Types.ObjectId.isValid(agreementId)) throw new AppError('Invalid agreement id', 400);
  const agreement = await AgreementModel.findOne({
    _id: new mongoose.Types.ObjectId(agreementId),
    orgId: new mongoose.Types.ObjectId(orgId),
  }).lean();
  if (!agreement || !(agreement as any).document) throw new AppError('No document uploaded for this agreement', 404);
  const doc = (agreement as any).document;
  return { url: await resolveFileUrl(doc.fileKey), fileName: doc.fileName };
}
