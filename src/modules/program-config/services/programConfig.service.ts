import mongoose from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import {
  ProgramConfigModel,
  ConfigScope,
  ProgramType,
  IRewardRules,
  ITokenRules,
} from '../models/programConfig.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { AuditEvent } from '../../audit/models/audit-log.model';
import { resolveLandlordOrgId } from '../../landlord/services/landlordDashboard.service';

/** Concrete (non-null) versions of the rule objects after resolution. */
export type ResolvedRewardRules = { [K in keyof IRewardRules]-?: NonNullable<IRewardRules[K]> };
export type ResolvedTokenRules = { [K in keyof ITokenRules]-?: NonNullable<ITokenRules[K]> };

/** Sensible platform defaults — the root of the inheritance chain. */
export const PLATFORM_DEFAULTS = {
  programType: 'RPA_ONLY' as ProgramType,
  rewardRules: {
    enabled: true,
    onTimeRentPoints: 100,
    renewalPoints: 500,
    maintenanceReportPoints: 50,
    monthlyPointsCap: 1000,
  } satisfies ResolvedRewardRules,
  tokenRules: {
    enabled: false,
    monthlyAccrualTokens: 10,
    vestingMonths: 12,
    tokenValueUsd: 1,
  } satisfies ResolvedTokenRules,
};

export interface ResolvedProgramConfig {
  programType: ProgramType;
  rewardRules: ResolvedRewardRules;
  tokenRules: ResolvedTokenRules;
  /** Which scope supplied each top-level field (PLATFORM when nothing overrode it). */
  provenance: Record<string, ConfigScope | 'PLATFORM'>;
}

type ConfigLayer = {
  scope: ConfigScope;
  programType?: ProgramType | null;
  rewardRules?: IRewardRules | null;
  tokenRules?: ITokenRules | null;
};

/**
 * Pure merge: layers ordered ORG → PROPERTY → UNIT → TENANT.
 * Later layers override earlier ones, field-by-field; null/undefined = inherit.
 */
export function mergeLayers(layers: ConfigLayer[]): ResolvedProgramConfig {
  const result: ResolvedProgramConfig = {
    programType: PLATFORM_DEFAULTS.programType,
    rewardRules: { ...PLATFORM_DEFAULTS.rewardRules },
    tokenRules: { ...PLATFORM_DEFAULTS.tokenRules },
    provenance: { programType: 'PLATFORM' },
  };
  for (const key of Object.keys(PLATFORM_DEFAULTS.rewardRules)) {
    result.provenance[`rewardRules.${key}`] = 'PLATFORM';
  }
  for (const key of Object.keys(PLATFORM_DEFAULTS.tokenRules)) {
    result.provenance[`tokenRules.${key}`] = 'PLATFORM';
  }

  for (const layer of layers) {
    if (layer.programType != null) {
      result.programType = layer.programType;
      result.provenance.programType = layer.scope;
    }
    if (layer.rewardRules) {
      for (const [key, value] of Object.entries(layer.rewardRules)) {
        if (value != null) {
          (result.rewardRules as any)[key] = value;
          result.provenance[`rewardRules.${key}`] = layer.scope;
        }
      }
    }
    if (layer.tokenRules) {
      for (const [key, value] of Object.entries(layer.tokenRules)) {
        if (value != null) {
          (result.tokenRules as any)[key] = value;
          result.provenance[`tokenRules.${key}`] = layer.scope;
        }
      }
    }
  }

  // programType implies enablement unless explicitly overridden at the same or lower scope
  if (result.provenance['rewardRules.enabled'] === 'PLATFORM') {
    result.rewardRules.enabled = result.programType === 'RPA_ONLY' || result.programType === 'BOTH';
  }
  if (result.provenance['tokenRules.enabled'] === 'PLATFORM') {
    result.tokenRules.enabled = result.programType === 'TEPA_ONLY' || result.programType === 'BOTH';
  }

  return result;
}

/** Resolve the target chain (property/unit/tenancy ids) from whichever id is given. */
async function resolveChain(target: {
  tenancyId?: string;
  unitId?: string;
  propertyId?: string;
}): Promise<{
  orgId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId | null;
  unitId: mongoose.Types.ObjectId | null;
  tenancyId: mongoose.Types.ObjectId | null;
}> {
  let tenancyId: mongoose.Types.ObjectId | null = null;
  let unitId: mongoose.Types.ObjectId | null = null;
  let propertyId: mongoose.Types.ObjectId | null = null;

  if (target.tenancyId) {
    if (!mongoose.Types.ObjectId.isValid(target.tenancyId)) throw new AppError('Invalid tenancyId', 400);
    const tenancy = await TenancyModel.findById(target.tenancyId).lean();
    if (!tenancy) throw new AppError('Tenancy not found', 404);
    tenancyId = (tenancy as any)._id;
    unitId = (tenancy as any).unitId;
  }
  if (target.unitId && !unitId) {
    if (!mongoose.Types.ObjectId.isValid(target.unitId)) throw new AppError('Invalid unitId', 400);
    unitId = new mongoose.Types.ObjectId(target.unitId);
  }
  if (unitId) {
    const unit = await UnitModel.findById(unitId).lean();
    if (!unit) throw new AppError('Unit not found', 404);
    propertyId = (unit as any).propertyId;
  }
  if (target.propertyId && !propertyId) {
    if (!mongoose.Types.ObjectId.isValid(target.propertyId)) throw new AppError('Invalid propertyId', 400);
    propertyId = new mongoose.Types.ObjectId(target.propertyId);
  }
  if (!propertyId) throw new AppError('propertyId, unitId, or tenancyId is required', 400);

  const property = await PropertyModel.findById(propertyId).lean();
  if (!property) throw new AppError('Property not found', 404);

  return { orgId: (property as any).orgId, propertyId, unitId, tenancyId };
}

/**
 * Effective config for a target, resolved through the full hierarchy.
 * Back-compat: a property with the legacy `participationModel` field and no
 * PROPERTY config doc still resolves that value as its programType layer.
 */
export async function resolveProgramConfig(target: {
  tenancyId?: string;
  unitId?: string;
  propertyId?: string;
}): Promise<ResolvedProgramConfig & { chain: { orgId: string; propertyId: string | null; unitId: string | null; tenancyId: string | null } }> {
  const chain = await resolveChain(target);

  const docs = await ProgramConfigModel.find({
    orgId: chain.orgId,
    $or: [
      { scope: 'ORG', propertyId: null, unitId: null, tenancyId: null },
      ...(chain.propertyId ? [{ scope: 'PROPERTY' as const, propertyId: chain.propertyId, unitId: null, tenancyId: null }] : []),
      ...(chain.unitId ? [{ scope: 'UNIT' as const, unitId: chain.unitId, tenancyId: null }] : []),
      ...(chain.tenancyId ? [{ scope: 'TENANT' as const, tenancyId: chain.tenancyId }] : []),
    ],
  }).lean();

  const byScope = new Map(docs.map((d: any) => [d.scope, d]));

  // Legacy fallback: property.participationModel acts as a PROPERTY-level programType
  if (!byScope.has('PROPERTY') && chain.propertyId) {
    const property: any = await PropertyModel.findById(chain.propertyId).select('participationModel').lean();
    if (property?.participationModel) {
      byScope.set('PROPERTY', { scope: 'PROPERTY', programType: property.participationModel });
    }
  }

  const layers = (['ORG', 'PROPERTY', 'UNIT', 'TENANT'] as ConfigScope[])
    .map((scope) => byScope.get(scope))
    .filter(Boolean) as ConfigLayer[];

  const resolved = mergeLayers(layers);
  return {
    ...resolved,
    chain: {
      orgId: chain.orgId.toString(),
      propertyId: chain.propertyId?.toString() ?? null,
      unitId: chain.unitId?.toString() ?? null,
      tenancyId: chain.tenancyId?.toString() ?? null,
    },
  };
}

/** Upsert a config document at one scope. Org-scoped to the caller. */
export async function upsertProgramConfig(
  userId: mongoose.Types.ObjectId,
  input: {
    scope: ConfigScope;
    propertyId?: string;
    unitId?: string;
    tenancyId?: string;
    programType?: ProgramType | null;
    rewardRules?: IRewardRules | null;
    tokenRules?: ITokenRules | null;
    effectiveDate?: string | null;
  }
) {
  const orgId = await resolveLandlordOrgId(userId);
  const orgOid = new mongoose.Types.ObjectId(orgId);

  // Validate the target belongs to the caller's org + derive the full key
  let key: any = { orgId: orgOid, scope: input.scope, propertyId: null, unitId: null, tenancyId: null };
  if (input.scope !== 'ORG') {
    const chain = await resolveChain({
      propertyId: input.propertyId,
      unitId: input.unitId,
      tenancyId: input.tenancyId,
    });
    if (chain.orgId.toString() !== orgId) {
      throw new AppError('Target is not in your organization', 403);
    }
    if (input.scope === 'PROPERTY') key = { ...key, propertyId: chain.propertyId };
    if (input.scope === 'UNIT') {
      if (!chain.unitId) throw new AppError('unitId is required for UNIT scope', 400);
      key = { ...key, propertyId: chain.propertyId, unitId: chain.unitId };
    }
    if (input.scope === 'TENANT') {
      if (!chain.tenancyId) throw new AppError('tenancyId is required for TENANT scope', 400);
      key = { ...key, propertyId: chain.propertyId, unitId: chain.unitId, tenancyId: chain.tenancyId };
    }
  }

  const before = await ProgramConfigModel.findOne(key).lean();

  const update = {
    ...key,
    programType: input.programType ?? null,
    rewardRules: input.rewardRules ?? null,
    tokenRules: input.tokenRules ?? null,
    effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : null,
    updatedBy: userId,
    ...(before ? {} : { createdBy: userId }),
  };

  const doc = await ProgramConfigModel.findOneAndUpdate(key, update, {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true,
  }).lean();

  AuditEvent.create({
    actorUserId: userId,
    orgId: orgOid,
    action: 'PROGRAM_CONFIG_CHANGED',
    entityType: 'programConfig',
    entityId: (doc as any)._id,
    source: 'user',
    updateType: 'manual',
    propertyId: key.propertyId,
    metadata: { scope: input.scope },
    diff: {
      before: before ? { programType: (before as any).programType, rewardRules: (before as any).rewardRules, tokenRules: (before as any).tokenRules } : null,
      after: { programType: (doc as any).programType, rewardRules: (doc as any).rewardRules, tokenRules: (doc as any).tokenRules },
    },
  }).catch(() => {});

  return doc;
}

/** List config docs for the caller's org (optionally filtered by property). */
export async function listProgramConfigs(
  userId: mongoose.Types.ObjectId,
  filter: { propertyId?: string }
) {
  const orgId = await resolveLandlordOrgId(userId);
  const query: any = { orgId: new mongoose.Types.ObjectId(orgId) };
  if (filter.propertyId) {
    if (!mongoose.Types.ObjectId.isValid(filter.propertyId)) throw new AppError('Invalid propertyId', 400);
    query.$or = [
      { scope: 'ORG' },
      { propertyId: new mongoose.Types.ObjectId(filter.propertyId) },
    ];
  }
  return ProgramConfigModel.find(query).sort({ scope: 1, updatedAt: -1 }).lean();
}

/** Delete a config override (target falls back to inherited values). */
export async function deleteProgramConfig(userId: mongoose.Types.ObjectId, configId: string) {
  if (!mongoose.Types.ObjectId.isValid(configId)) throw new AppError('Invalid config id', 400);
  const orgId = await resolveLandlordOrgId(userId);
  const doc = await ProgramConfigModel.findOne({
    _id: new mongoose.Types.ObjectId(configId),
    orgId: new mongoose.Types.ObjectId(orgId),
  });
  if (!doc) throw new AppError('Config not found', 404);

  await doc.deleteOne();

  AuditEvent.create({
    actorUserId: userId,
    orgId: doc.orgId,
    action: 'PROGRAM_CONFIG_DELETED',
    entityType: 'programConfig',
    entityId: doc._id,
    source: 'user',
    updateType: 'manual',
    propertyId: doc.propertyId ?? null,
    metadata: { scope: doc.scope },
    diff: { before: { programType: doc.programType }, after: null },
  }).catch(() => {});
}
