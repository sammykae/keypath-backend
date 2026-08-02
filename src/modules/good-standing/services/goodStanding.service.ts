import mongoose from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import {
  TenantGoodStandingModel,
  GoodStandingStatus,
  StandingFlagType,
  GOOD_STANDING_THRESHOLDS,
  ELIGIBILITY_BLOCKING_STATUSES,
  FLAG_SEVERITY,
  STATUS_RANK,
} from '../models/goodStanding.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { UnitModel } from '../../units/models/unit.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitFinancialsModel } from '../../finances/models/unitFinancialsModel';
import { AuditEvent } from '../../audit/models/audit-log.model';
import { resolveLandlordOrgId } from '../../landlord/services/landlordDashboard.service';

export interface GoodStandingResult {
  status: GoodStandingStatus;
  /** Human-readable reasons behind the computed status. */
  reasons: string[];
  /** True when an admin override is in effect. */
  overridden: boolean;
  arrearsDays: number;
  activeFlags: { id: string; type: StandingFlagType; note: string; flaggedAt: string }[];
  eligibleForRewards: boolean;
  eligibleForTokens: boolean;
  computedAt: string;
}

/** Pure decision function — kept separate so it is unit-testable without a DB. */
export function computeStatus(input: {
  arrearsDays: number;
  activeFlagTypes: StandingFlagType[];
  tenancyStatus: string;
  override?: { status: GoodStandingStatus; reason: string } | null;
}): { status: GoodStandingStatus; reasons: string[]; overridden: boolean } {
  if (input.override) {
    return {
      status: input.override.status,
      reasons: [`Admin override: ${input.override.reason}`],
      overridden: true,
    };
  }

  let status: GoodStandingStatus = 'ACTIVE';
  const reasons: string[] = [];

  const bump = (candidate: GoodStandingStatus, reason: string) => {
    reasons.push(reason);
    if (STATUS_RANK[candidate] > STATUS_RANK[status]) status = candidate;
  };

  if (input.tenancyStatus === 'TERMINATED') {
    bump('SUSPENDED', 'Tenancy terminated');
  }

  const days = input.arrearsDays;
  if (days >= GOOD_STANDING_THRESHOLDS.suspendedDaysLate) {
    bump('SUSPENDED', `Rent ${days} days late`);
  } else if (days >= GOOD_STANDING_THRESHOLDS.pausedDaysLate) {
    bump('PAUSED', `Rent ${days} days late`);
  } else if (days >= GOOD_STANDING_THRESHOLDS.atRiskDaysLate) {
    bump('AT_RISK', `Rent ${days} days late`);
  }

  for (const flagType of input.activeFlagTypes) {
    bump(FLAG_SEVERITY[flagType], `Active flag: ${flagType.replace(/_/g, ' ').toLowerCase()}`);
  }

  if (reasons.length === 0) reasons.push('Rent current, no active flags');

  return { status, reasons, overridden: false };
}

async function latestArrearsDays(unitId: mongoose.Types.ObjectId): Promise<number> {
  const rows = await UnitFinancialsModel.find({ unitId })
    .sort({ month: -1 })
    .limit(1)
    .lean();
  return (rows[0] as any)?.arrearsDays ?? 0;
}

/** Find-or-create the standing record for a tenant's active tenancy. */
async function getOrCreateRecord(tenantUserId: mongoose.Types.ObjectId) {
  const tenancy = await TenancyModel.findOne({
    tenantUserId,
    status: { $in: ['ACTIVE', 'PENDING'] },
  })
    .sort({ updatedAt: -1 })
    .lean();
  if (!tenancy) throw new AppError('No active tenancy found for tenant', 404);

  const unit = await UnitModel.findById(tenancy.unitId).lean();
  const property = unit ? await PropertyModel.findById((unit as any).propertyId).lean() : null;
  if (!property) throw new AppError('Property not found for tenancy', 404);

  let record = await TenantGoodStandingModel.findOne({ tenancyId: tenancy._id });
  if (!record) {
    record = await TenantGoodStandingModel.create({
      orgId: (property as any).orgId,
      tenantUserId,
      tenancyId: tenancy._id,
      propertyId: (property as any)._id,
      flags: [],
      override: null,
    });
  }
  return { record, tenancy };
}

export async function getGoodStanding(
  tenantUserId: mongoose.Types.ObjectId
): Promise<GoodStandingResult> {
  const { record, tenancy } = await getOrCreateRecord(tenantUserId);
  const arrearsDays = await latestArrearsDays(tenancy.unitId as mongoose.Types.ObjectId);

  const activeFlags = record.flags.filter((f) => !f.resolvedAt);
  const computed = computeStatus({
    arrearsDays,
    activeFlagTypes: activeFlags.map((f) => f.type),
    tenancyStatus: (tenancy as any).status,
    override: record.override ?? null,
  });

  const blocked = ELIGIBILITY_BLOCKING_STATUSES.includes(computed.status);

  return {
    status: computed.status,
    reasons: computed.reasons,
    overridden: computed.overridden,
    arrearsDays,
    activeFlags: activeFlags.map((f) => ({
      id: f._id.toString(),
      type: f.type,
      note: f.note,
      flaggedAt: f.flaggedAt.toISOString(),
    })),
    eligibleForRewards: !blocked,
    eligibleForTokens: !blocked,
    computedAt: new Date().toISOString(),
  };
}

/** Cheap eligibility check for gating earn/redeem paths. Fails open on missing tenancy. */
export async function isEligibleForEarnings(
  tenantUserId: mongoose.Types.ObjectId
): Promise<{ ok: boolean; status: GoodStandingStatus | null; reason: string | null }> {
  try {
    const standing = await getGoodStanding(tenantUserId);
    if (ELIGIBILITY_BLOCKING_STATUSES.includes(standing.status)) {
      return { ok: false, status: standing.status, reason: standing.reasons.join('; ') };
    }
    return { ok: true, status: standing.status, reason: null };
  } catch {
    // No tenancy record — let the caller's own validation handle it
    return { ok: true, status: null, reason: null };
  }
}

/** Landlord list: standing for every tenant in the org. */
export async function listGoodStandingForOrg(userId: mongoose.Types.ObjectId) {
  const orgId = await resolveLandlordOrgId(userId);
  const orgOid = new mongoose.Types.ObjectId(orgId);

  const properties = await PropertyModel.find({ orgId: orgOid }, '_id name').lean();
  const propIds = properties.map((p: any) => p._id);
  const propNameById = new Map(properties.map((p: any) => [p._id.toString(), (p as any).name ?? '']));
  const units = await UnitModel.find({ propertyId: { $in: propIds } }, '_id propertyId').lean();
  const propIdByUnitId = new Map(units.map((u: any) => [u._id.toString(), u.propertyId.toString()]));
  const tenancies = await TenancyModel.find({
    unitId: { $in: units.map((u: any) => u._id) },
    status: { $in: ['ACTIVE', 'PENDING'] },
  }).lean();

  const results = [];
  for (const t of tenancies as any[]) {
    try {
      const standing = await getGoodStanding(t.tenantUserId);
      const propId = propIdByUnitId.get(t.unitId.toString());
      results.push({
        tenantUserId: t.tenantUserId.toString(),
        tenancyId: t._id.toString(),
        propertyName: propId ? propNameById.get(propId) ?? null : null,
        ...standing,
      });
    } catch {
      // skip tenants without resolvable standing
    }
  }
  return results;
}

export async function flagTenant(
  landlordUserId: mongoose.Types.ObjectId,
  tenantUserId: mongoose.Types.ObjectId,
  input: { type: StandingFlagType; note: string }
) {
  const orgId = await resolveLandlordOrgId(landlordUserId);
  const { record } = await getOrCreateRecord(tenantUserId);
  if (record.orgId.toString() !== orgId) {
    throw new AppError('Tenant is not in your organization', 403);
  }

  const before = await getGoodStanding(tenantUserId);

  record.flags.push({
    type: input.type,
    note: input.note,
    flaggedBy: landlordUserId,
    flaggedAt: new Date(),
    resolvedAt: null,
    resolvedBy: null,
  } as any);
  await record.save();

  const after = await getGoodStanding(tenantUserId);

  AuditEvent.create({
    actorUserId: landlordUserId,
    orgId: record.orgId,
    action: 'GOOD_STANDING_FLAGGED',
    entityType: 'tenantGoodStanding',
    entityId: record._id,
    source: 'user',
    updateType: 'manual',
    propertyId: record.propertyId,
    tenantId: tenantUserId,
    metadata: { flagType: input.type, note: input.note },
    diff: { before: { status: before.status }, after: { status: after.status } },
  }).catch(() => {});

  return after;
}

export async function resolveFlag(
  landlordUserId: mongoose.Types.ObjectId,
  tenantUserId: mongoose.Types.ObjectId,
  flagId: string
) {
  const orgId = await resolveLandlordOrgId(landlordUserId);
  const { record } = await getOrCreateRecord(tenantUserId);
  if (record.orgId.toString() !== orgId) {
    throw new AppError('Tenant is not in your organization', 403);
  }

  const flag = record.flags.find((f) => f._id.toString() === flagId && !f.resolvedAt);
  if (!flag) throw new AppError('Active flag not found', 404);

  const before = await getGoodStanding(tenantUserId);

  flag.resolvedAt = new Date();
  flag.resolvedBy = landlordUserId;
  await record.save();

  const after = await getGoodStanding(tenantUserId);

  AuditEvent.create({
    actorUserId: landlordUserId,
    orgId: record.orgId,
    action: 'GOOD_STANDING_FLAG_RESOLVED',
    entityType: 'tenantGoodStanding',
    entityId: record._id,
    source: 'user',
    updateType: 'manual',
    propertyId: record.propertyId,
    tenantId: tenantUserId,
    metadata: { flagType: flag.type },
    diff: { before: { status: before.status }, after: { status: after.status } },
  }).catch(() => {});

  return after;
}

/** Admin-only: set or clear a manual override. */
export async function setOverride(
  adminUserId: mongoose.Types.ObjectId,
  tenantUserId: mongoose.Types.ObjectId,
  input: { status: GoodStandingStatus; reason: string } | null
) {
  const { record } = await getOrCreateRecord(tenantUserId);
  const before = await getGoodStanding(tenantUserId);

  record.override = input
    ? { status: input.status, reason: input.reason, setBy: adminUserId, setAt: new Date() }
    : null;
  await record.save();

  const after = await getGoodStanding(tenantUserId);

  AuditEvent.create({
    actorUserId: adminUserId,
    orgId: record.orgId,
    action: input ? 'GOOD_STANDING_OVERRIDE_SET' : 'GOOD_STANDING_OVERRIDE_CLEARED',
    entityType: 'tenantGoodStanding',
    entityId: record._id,
    source: 'user',
    updateType: 'manual',
    propertyId: record.propertyId,
    tenantId: tenantUserId,
    metadata: input ? { status: input.status, reason: input.reason } : null,
    diff: { before: { status: before.status }, after: { status: after.status } },
  }).catch(() => {});

  return after;
}
