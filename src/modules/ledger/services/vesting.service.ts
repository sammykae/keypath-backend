import mongoose from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { TokenLedgerEntryModel, TokenLedgerEntryType } from '../models/tokenLedgerEntry.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { UnitModel } from '../../units/models/unit.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { AuditEvent } from '../../audit/models/audit-log.model';
import { resolveLandlordOrgId } from '../../landlord/services/landlordDashboard.service';
import { resolveProgramConfig } from '../../program-config/services/programConfig.service';
import { isEligibleForEarnings } from '../../good-standing/services/goodStanding.service';
import { isTepaAgreementActive } from '../../agreements/services/agreement.service';

/**
 * Time-based vesting (Laurel, Q3): tokens accrue monthly over the tenancy and
 * each accrued token vests `vestingMonths` months after its ledger timestamp.
 * Purchased tokens vest immediately. Negative entries (forfeit/deduction)
 * consume the unvested pool first, then the vested pool.
 */

const MS_PER_MONTH = 30.44 * 24 * 60 * 60 * 1000;

export interface VestingEntryInput {
  type: TokenLedgerEntryType | string;
  tokens: number;
  timestamp: Date;
}

export interface VestingBreakdown {
  totalTokens: number;
  vestedTokens: number;
  unvestedTokens: number;
}

/** Entry types that vest over time (earned tokens). */
const TIME_VESTING_TYPES = new Set<string>([
  TokenLedgerEntryType.ACCRUAL,
  TokenLedgerEntryType.VESTING,
]);

/** Entry types that are vested immediately. */
const IMMEDIATE_VESTING_TYPES = new Set<string>([
  TokenLedgerEntryType.PURCHASE,
  TokenLedgerEntryType.SPOT_PURCHASE,
  TokenLedgerEntryType.INCENTIVE_TOKEN,
]);

/** Pure vesting computation — unit-testable without a DB. */
export function computeVesting(
  entries: VestingEntryInput[],
  vestingMonths: number,
  now: Date = new Date()
): VestingBreakdown {
  let vested = 0;
  let unvested = 0;
  let negatives = 0;

  for (const e of entries) {
    if (e.tokens < 0) {
      negatives += -e.tokens;
      continue;
    }
    if (IMMEDIATE_VESTING_TYPES.has(e.type)) {
      vested += e.tokens;
      continue;
    }
    if (TIME_VESTING_TYPES.has(e.type)) {
      const ageMonths = (now.getTime() - new Date(e.timestamp).getTime()) / MS_PER_MONTH;
      if (ageMonths >= vestingMonths) vested += e.tokens;
      else unvested += e.tokens;
      continue;
    }
    // adjustments / corrections / other positive entries — treat as vested
    vested += e.tokens;
  }

  // Negative entries consume unvested first, then vested
  const fromUnvested = Math.min(unvested, negatives);
  unvested -= fromUnvested;
  vested = Math.max(0, vested - (negatives - fromUnvested));

  return {
    totalTokens: vested + unvested,
    vestedTokens: vested,
    unvestedTokens: unvested,
  };
}

/** Tenant-facing vesting summary, driven by the resolved program config. */
export async function getVestingSummary(tenantUserId: mongoose.Types.ObjectId) {
  const tenancy = await TenancyModel.findOne({
    tenantUserId,
    status: { $in: ['ACTIVE', 'PENDING'] },
  })
    .sort({ updatedAt: -1 })
    .lean();
  if (!tenancy) throw new AppError('No active tenancy found', 404);

  const unit = await UnitModel.findById((tenancy as any).unitId).lean();
  if (!unit) throw new AppError('Unit not found', 404);
  const propertyId = (unit as any).propertyId as mongoose.Types.ObjectId;

  const config = await resolveProgramConfig({ tenancyId: (tenancy as any)._id.toString() });

  const entries = await TokenLedgerEntryModel.find({
    tenantId: tenantUserId,
    propertyId,
  })
    .select('type tokens timestamp')
    .lean();

  const breakdown = computeVesting(
    entries.map((e: any) => ({ type: e.type, tokens: e.tokens, timestamp: e.timestamp })),
    config.tokenRules.vestingMonths
  );

  // Next vesting date = oldest unvested time-vesting entry + vestingMonths
  const now = Date.now();
  let nextVestingDate: string | null = null;
  const unvestedTimes = entries
    .filter((e: any) => TIME_VESTING_TYPES.has(e.type) && e.tokens > 0)
    .map((e: any) => new Date(e.timestamp).getTime() + config.tokenRules.vestingMonths * MS_PER_MONTH)
    .filter((t) => t > now)
    .sort((a, b) => a - b);
  if (unvestedTimes.length) nextVestingDate = new Date(unvestedTimes[0]).toISOString();

  // Acceptance criterion: TEPA features must not show active unless the TEPA
  // agreement itself is signed/active — checked against the authoritative
  // Agreement record, not just programType/tokensEnabled config flags.
  const tepaAgreementActive = await isTepaAgreementActive(tenantUserId, (unit as any)._id);

  return {
    ...breakdown,
    tokenValueUsd: config.tokenRules.tokenValueUsd,
    totalValueUsd: breakdown.totalTokens * config.tokenRules.tokenValueUsd,
    vestedValueUsd: breakdown.vestedTokens * config.tokenRules.tokenValueUsd,
    monthlyAccrualTokens: config.tokenRules.monthlyAccrualTokens,
    vestingMonths: config.tokenRules.vestingMonths,
    tokensEnabled: config.tokenRules.enabled,
    tepaAgreementActive,
    programType: config.programType,
    nextVestingDate,
  };
}

/**
 * Monthly accrual run for the landlord org (Laurel: tokens accrue monthly).
 * Idempotent per tenant+period via the entry source marker. dryRun previews.
 */
export async function runMonthlyAccrual(
  landlordUserId: mongoose.Types.ObjectId,
  period: string, // YYYY-MM
  dryRun: boolean
) {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new AppError('period must be YYYY-MM', 400);
  const orgId = await resolveLandlordOrgId(landlordUserId);
  const orgOid = new mongoose.Types.ObjectId(orgId);
  const sourceMarker = `MONTHLY_ACCRUAL:${period}`;

  const properties = await PropertyModel.find({ orgId: orgOid }, '_id name').lean();
  const propIds = properties.map((p: any) => p._id);
  const units = await UnitModel.find({ propertyId: { $in: propIds } }, '_id propertyId').lean();
  const unitById = new Map(units.map((u: any) => [u._id.toString(), u]));
  const tenancies = await TenancyModel.find({
    unitId: { $in: units.map((u: any) => u._id) },
    status: 'ACTIVE',
  }).lean();

  const results: {
    tenantUserId: string;
    tenancyId: string;
    tokens: number;
    action: 'ISSUED' | 'WOULD_ISSUE' | 'SKIPPED';
    reason?: string;
  }[] = [];

  for (const t of tenancies as any[]) {
    const unit = unitById.get(t.unitId.toString());
    if (!unit) continue;
    const propertyId = (unit as any).propertyId as mongoose.Types.ObjectId;

    const config = await resolveProgramConfig({ tenancyId: t._id.toString() });
    if (!config.tokenRules.enabled || config.tokenRules.monthlyAccrualTokens <= 0) {
      results.push({
        tenantUserId: t.tenantUserId.toString(), tenancyId: t._id.toString(),
        tokens: 0, action: 'SKIPPED', reason: 'Tokens not enabled for this tenancy',
      });
      continue;
    }

    const eligibility = await isEligibleForEarnings(t.tenantUserId);
    if (!eligibility.ok) {
      results.push({
        tenantUserId: t.tenantUserId.toString(), tenancyId: t._id.toString(),
        tokens: 0, action: 'SKIPPED', reason: `Good Standing is ${eligibility.status}`,
      });
      continue;
    }

    const existing = await TokenLedgerEntryModel.findOne({
      tenantId: t.tenantUserId,
      propertyId,
      source: sourceMarker,
    }).lean();
    if (existing) {
      results.push({
        tenantUserId: t.tenantUserId.toString(), tenancyId: t._id.toString(),
        tokens: 0, action: 'SKIPPED', reason: 'Already accrued for this period',
      });
      continue;
    }

    if (dryRun) {
      results.push({
        tenantUserId: t.tenantUserId.toString(), tenancyId: t._id.toString(),
        tokens: config.tokenRules.monthlyAccrualTokens, action: 'WOULD_ISSUE',
      });
      continue;
    }

    await TokenLedgerEntryModel.create({
      tenantId: t.tenantUserId,
      propertyId,
      type: TokenLedgerEntryType.ACCRUAL,
      tokens: config.tokenRules.monthlyAccrualTokens,
      value: config.tokenRules.monthlyAccrualTokens * config.tokenRules.tokenValueUsd,
      timestamp: new Date(),
      source: sourceMarker,
    });

    results.push({
      tenantUserId: t.tenantUserId.toString(), tenancyId: t._id.toString(),
      tokens: config.tokenRules.monthlyAccrualTokens, action: 'ISSUED',
    });
  }

  if (!dryRun) {
    AuditEvent.create({
      actorUserId: landlordUserId,
      orgId: orgOid,
      action: 'MONTHLY_TOKEN_ACCRUAL_RUN',
      entityType: 'tokenLedger',
      source: 'user',
      updateType: 'manual',
      metadata: {
        period,
        issued: results.filter((r) => r.action === 'ISSUED').length,
        skipped: results.filter((r) => r.action === 'SKIPPED').length,
      },
    }).catch(() => {});
  }

  return {
    period,
    dryRun,
    issued: results.filter((r) => r.action !== 'SKIPPED').length,
    skipped: results.filter((r) => r.action === 'SKIPPED').length,
    results,
  };
}
