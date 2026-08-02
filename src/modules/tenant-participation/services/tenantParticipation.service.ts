import mongoose from 'mongoose';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { UnitModel } from '../../units/models/unit.model';
import {
  PropertyModel,
  type PropertyTenantParticipationAllowed,
} from '../../properties/models/propertyModel';
import { TenantParticipationModel } from '../models/tenantParticipation.model';
import type { TenantParticipationType } from '../models/tenantParticipation.model';
import { AppError } from '../../../core/errors/AppError';
import { resolveLandlordOrgId } from '../../landlord/services/landlordDashboard.service';
import type { UpsertTenantParticipationBody } from '../dto/tenantParticipation.dto';

function oidString(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v !== null && 'toString' in v) {
    return String((v as { toString: () => string }).toString());
  }
  return String(v);
}

function dateIso(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return undefined;
}

/** Plain JSON for API responses (Swagger-friendly). */
export function formatTenantParticipationDoc(
  doc: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!doc) return null;
  return {
    _id: oidString(doc._id),
    tenantId: oidString(doc.tenantId),
    propertyId: oidString(doc.propertyId),
    tenancyId: oidString(doc.tenancyId),
    tenantParticipationType: doc.tenantParticipationType,
    rpaEnrollmentStatus: doc.rpaEnrollmentStatus,
    tepaEnrollmentStatus: doc.tepaEnrollmentStatus,
    createdAt: dateIso(doc.createdAt),
    updatedAt: dateIso(doc.updatedAt),
  };
}

export function isParticipationTypeAllowed(
  allowed: PropertyTenantParticipationAllowed,
  requested: TenantParticipationType
): boolean {
  switch (allowed) {
    case 'NONE':
      return requested === 'NONE';
    case 'RPA_ONLY':
      return requested === 'NONE' || requested === 'RPA_ONLY';
    case 'TEPA_ONLY':
      return requested === 'NONE' || requested === 'TEPA_ONLY';
    case 'BOTH':
      return true;
    default:
      return true;
  }
}

function effectivePropertyAllowed(
  raw: PropertyTenantParticipationAllowed | undefined | null
): PropertyTenantParticipationAllowed {
  return raw ?? 'BOTH';
}

async function loadTenancyChain(tenancyOid: mongoose.Types.ObjectId) {
  const tenancy = await TenancyModel.findById(tenancyOid).lean();
  if (!tenancy) {
    throw new AppError('Tenancy not found', 404);
  }

  const unit = await UnitModel.findById(tenancy.unitId).lean();
  if (!unit) {
    throw new AppError('Unit not found for tenancy', 404);
  }

  const property = await PropertyModel.findById(unit.propertyId).lean();
  if (!property) {
    throw new AppError('Property not found for unit', 404);
  }

  return { tenancy, unit, property };
}

function assertOrgOwnsProperty(
  propertyOrgId: mongoose.Types.ObjectId,
  orgId: string
): void {
  if (propertyOrgId.toString() !== orgId) {
    throw new AppError('Property is not in your organization', 403);
  }
}

export async function upsertTenantParticipationForLandlord(
  landlordUserId: mongoose.Types.ObjectId,
  authOrgId: string | null | undefined,
  body: UpsertTenantParticipationBody
): Promise<Record<string, unknown>> {
  const orgId = await resolveLandlordOrgId(landlordUserId, authOrgId);
  const tenancyOid = new mongoose.Types.ObjectId(body.tenancyId);

  const { tenancy, unit, property } = await loadTenancyChain(tenancyOid);
  assertOrgOwnsProperty(property.orgId as mongoose.Types.ObjectId, orgId);

  const propertyAllowed = effectivePropertyAllowed(
    (property as { tenantParticipationAllowed?: PropertyTenantParticipationAllowed })
      .tenantParticipationAllowed
  );

  const existing = await TenantParticipationModel.findOne({ tenancyId: tenancyOid }).lean();

  const nextType: TenantParticipationType =
    body.tenantParticipationType ??
    (existing?.tenantParticipationType as TenantParticipationType | undefined) ??
    'NONE';

  if (!isParticipationTypeAllowed(propertyAllowed, nextType)) {
    throw new AppError(
      `tenantParticipationType exceeds property allowance (${propertyAllowed})`,
      403
    );
  }

  const tenantId = tenancy.tenantUserId as mongoose.Types.ObjectId;
  const propertyId = unit.propertyId as mongoose.Types.ObjectId;

  if (
    existing &&
    (existing.tenantId as mongoose.Types.ObjectId).toString() !== tenantId.toString()
  ) {
    throw new AppError('Tenancy tenant mismatch for existing participation record', 409);
  }

  const setDoc: Record<string, unknown> = {
    tenantId,
    propertyId,
    tenancyId: tenancyOid,
  };
  if (body.tenantParticipationType !== undefined) {
    setDoc.tenantParticipationType = body.tenantParticipationType;
  }
  if (body.rpaEnrollmentStatus !== undefined) {
    setDoc.rpaEnrollmentStatus = body.rpaEnrollmentStatus;
  }
  if (body.tepaEnrollmentStatus !== undefined) {
    setDoc.tepaEnrollmentStatus = body.tepaEnrollmentStatus;
  }

  const updated = await TenantParticipationModel.findOneAndUpdate(
    { tenancyId: tenancyOid },
    { $set: setDoc },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  if (!updated) {
    throw new AppError('Failed to save tenant participation', 500);
  }

  const plain = updated.toObject({ versionKey: false }) as unknown as Record<string, unknown>;
  const formatted = formatTenantParticipationDoc(plain);
  if (!formatted) {
    throw new AppError('Failed to save tenant participation', 500);
  }
  return formatted;
}

export async function getTenantParticipationForLandlord(
  landlordUserId: mongoose.Types.ObjectId,
  authOrgId: string | null | undefined,
  tenancyId: string
): Promise<Record<string, unknown> | null> {
  const orgId = await resolveLandlordOrgId(landlordUserId, authOrgId);
  const tenancyOid = new mongoose.Types.ObjectId(tenancyId);

  const { unit, property } = await loadTenancyChain(tenancyOid);
  assertOrgOwnsProperty(property.orgId as mongoose.Types.ObjectId, orgId);

  const doc = await TenantParticipationModel.findOne({ tenancyId: tenancyOid }).lean();
  return formatTenantParticipationDoc(doc as Record<string, unknown> | null);
}

export async function getTenantParticipationForTenant(
  tenantUserId: mongoose.Types.ObjectId,
  tenancyId: string
): Promise<Record<string, unknown> | null> {
  const tenancyOid = new mongoose.Types.ObjectId(tenancyId);
  const tenancy = await TenancyModel.findById(tenancyOid).lean();
  if (!tenancy) {
    throw new AppError('Tenancy not found', 404);
  }
  if ((tenancy.tenantUserId as mongoose.Types.ObjectId).toString() !== tenantUserId.toString()) {
    throw new AppError('Forbidden', 403);
  }

  const doc = await TenantParticipationModel.findOne({ tenancyId: tenancyOid }).lean();
  return formatTenantParticipationDoc(doc as Record<string, unknown> | null);
}
