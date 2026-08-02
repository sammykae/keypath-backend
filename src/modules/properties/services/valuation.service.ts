import mongoose from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { PropertyModel } from '../models/propertyModel';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { UnitModel } from '../../units/models/unit.model';
import { AuditEvent } from '../../audit/models/audit-log.model';
import { TokenLedgerEntryModel, TokenLedgerEntryType } from '../../ledger/models/tokenLedgerEntry.model';
import {
  ValuationSnapshotModel,
  IValuationSnapshot,
  ValuationMethod,
  ValuationSource,
} from '../models/valuationSnapshot.model';

const ANNUAL_MS = 365 * 24 * 60 * 60 * 1000;
const DUE_SOON_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export interface ValuationSnapshotDTO {
  id: string;
  propertyId: string;
  valuationUsd: number;
  method: ValuationMethod;
  source: ValuationSource;
  effectiveDate: string;
  notes: string | null;
  createdAt: string;
}

function toDTO(v: IValuationSnapshot): ValuationSnapshotDTO {
  return {
    id: v._id.toString(),
    propertyId: v.propertyId.toString(),
    valuationUsd: v.valuationUsd,
    method: v.method,
    source: v.source,
    effectiveDate: v.effectiveDate.toISOString(),
    notes: v.notes ?? null,
    createdAt: v.createdAt.toISOString(),
  };
}

export interface RecordValuationInput {
  valuationUsd: number;
  method: ValuationMethod;
  source: ValuationSource;
  effectiveDate?: Date;
  notes?: string;
}

/**
 * Landlord/admin records a new (typically annual) valuation for a property.
 * Keeps Property.valuationUsd in sync (the single field every other
 * ownership/participation calc already reads) and writes a zero-token
 * VALUATION_UPDATE ledger entry per active tenant so the event shows up in
 * both the tenant's and the landlord's token ledger views.
 */
export async function recordValuation(
  actorUserId: mongoose.Types.ObjectId,
  orgId: string,
  propertyId: string,
  input: RecordValuationInput
): Promise<ValuationSnapshotDTO> {
  if (!mongoose.Types.ObjectId.isValid(propertyId)) throw new AppError('Invalid propertyId', 400);
  const property = await PropertyModel.findOne({
    _id: new mongoose.Types.ObjectId(propertyId),
    orgId: new mongoose.Types.ObjectId(orgId),
  });
  if (!property) throw new AppError('Property not found in your organization', 404);

  const effectiveDate = input.effectiveDate ?? new Date();

  const snapshot = await ValuationSnapshotModel.create({
    orgId: new mongoose.Types.ObjectId(orgId),
    propertyId: property._id,
    valuationUsd: input.valuationUsd,
    method: input.method,
    source: input.source,
    effectiveDate,
    notes: input.notes ?? null,
    createdBy: actorUserId,
  });

  const previousValuationUsd = property.valuationUsd ?? null;
  property.valuationUsd = input.valuationUsd;
  await property.save();

  const units = await UnitModel.find({ propertyId: property._id }, '_id').lean();
  const tenancies = await TenancyModel.find(
    { unitId: { $in: units.map((u: any) => u._id) }, status: 'ACTIVE' },
    'tenantUserId'
  ).lean();

  await Promise.all(
    (tenancies as any[]).map((t) =>
      TokenLedgerEntryModel.create({
        tenantId: t.tenantUserId,
        propertyId: property._id,
        type: TokenLedgerEntryType.VALUATION_UPDATE,
        tokens: 0,
        value: input.valuationUsd,
        timestamp: effectiveDate,
        source: `VALUATION:${snapshot._id.toString()}`,
      }).catch(() => {})
    )
  );

  AuditEvent.create({
    actorUserId,
    orgId: new mongoose.Types.ObjectId(orgId),
    action: 'PROPERTY_VALUATION_RECORDED',
    entityType: 'ValuationSnapshot',
    entityId: snapshot._id,
    source: 'user',
    updateType: 'manual',
    propertyId: property._id,
    diff: { before: { valuationUsd: previousValuationUsd }, after: { valuationUsd: input.valuationUsd } },
  }).catch(() => {});

  return toDTO(snapshot);
}

export async function listValuationHistory(propertyId: string): Promise<ValuationSnapshotDTO[]> {
  if (!mongoose.Types.ObjectId.isValid(propertyId)) throw new AppError('Invalid propertyId', 400);
  const rows = await ValuationSnapshotModel.find({ propertyId: new mongoose.Types.ObjectId(propertyId) })
    .sort({ effectiveDate: -1 })
    .lean();
  return (rows as any[]).map((r) => toDTO(r));
}

export type ValuationStatus = 'NONE' | 'CURRENT' | 'DUE_SOON' | 'OVERDUE';

export interface ValuationStatusDTO {
  status: ValuationStatus;
  latest: ValuationSnapshotDTO | null;
  nextDueDate: string | null;
}

/** Annual Valuation Status: is this property's valuation current, due soon, overdue, or never recorded. */
export async function getValuationStatus(propertyId: string): Promise<ValuationStatusDTO> {
  if (!mongoose.Types.ObjectId.isValid(propertyId)) throw new AppError('Invalid propertyId', 400);
  const latest = await ValuationSnapshotModel.findOne({ propertyId: new mongoose.Types.ObjectId(propertyId) })
    .sort({ effectiveDate: -1 })
    .lean();

  if (!latest) {
    return { status: 'NONE', latest: null, nextDueDate: null };
  }

  const nextDue = new Date((latest as any).effectiveDate.getTime() + ANNUAL_MS);
  const now = Date.now();
  let status: ValuationStatus;
  if (nextDue.getTime() < now) status = 'OVERDUE';
  else if (nextDue.getTime() - now <= DUE_SOON_WINDOW_MS) status = 'DUE_SOON';
  else status = 'CURRENT';

  return {
    status,
    latest: toDTO(latest as any),
    nextDueDate: nextDue.toISOString(),
  };
}
