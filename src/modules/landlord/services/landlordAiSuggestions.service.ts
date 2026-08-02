import mongoose from 'mongoose';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { UnitFinancialsModel } from '../../finances/models/unitFinancialsModel';
import { MaintenanceTicketModel } from '../../maintenance/models/maintenanceTicket.model';
import { listGoodStandingForOrg } from '../../good-standing/services/goodStanding.service';
import { resolveLandlordOrgId } from './landlordDashboard.service';

/**
 * P2 "AI Suggestions" rework — every suggestion below is a deterministic rule over
 * real portfolio data (rules-based MVP per the ticket, not an LLM call). No magnitude
 * claims are invented: every number in `text` is read directly from `sourceData`.
 * `reason` answers "why am I seeing this?" for the UI's helper text.
 */
export type SuggestionCategory =
  | 'REVENUE'
  | 'VACANCY'
  | 'RENEWAL_RISK'
  | 'MAINTENANCE_CAPEX'
  | 'TENANT_AT_RISK'
  | 'LATE_RENT'
  | 'RETENTION'
  | 'OPERATING_PERFORMANCE'
  | 'GENERAL';

export interface AiSuggestion {
  text: string;
  type: SuggestionCategory;
  /** "Why am I seeing this?" — human-readable basis for the suggestion. */
  reason: string;
  /** Machine-readable evidence backing the claim (unit/tenancy ids, counts, amounts). */
  sourceData: Record<string, unknown>;
}

const MAINTENANCE_LOOKBACK_MONTHS = 6;
const MAINTENANCE_REPEAT_THRESHOLD = 3;

export async function getLandlordAiSuggestions(
  userId: mongoose.Types.ObjectId,
  authOrgId?: string | null
): Promise<{ suggestions: AiSuggestion[] }> {
  const orgId = await resolveLandlordOrgId(userId, authOrgId);
  const orgOid = new mongoose.Types.ObjectId(orgId);

  const properties = await PropertyModel.find({ orgId: orgOid }).lean();
  if (!properties.length) {
    return {
      suggestions: [
        {
          text: 'Add your first property to start receiving portfolio-based suggestions.',
          type: 'GENERAL',
          reason: 'No properties exist in your organization yet.',
          sourceData: { propertyCount: 0 },
        },
      ],
    };
  }
  const propertyIds = properties.map((p: any) => p._id);
  const propertyById = new Map(properties.map((p: any) => [p._id.toString(), p]));

  const units = await UnitModel.find({ propertyId: { $in: propertyIds } }).lean();
  const unitIds = units.map((u: any) => u._id);
  const unitPropertyById = new Map(units.map((u: any) => [u._id.toString(), u.propertyId.toString()]));

  const tenancies = await TenancyModel.find({ unitId: { $in: unitIds } }).lean();
  const activeTenancies = tenancies.filter((t: any) => t.status === 'ACTIVE');

  const goodStanding = await listGoodStandingForOrg(userId);
  const standingByTenant = new Map(goodStanding.map((g) => [g.tenantUserId, g]));

  const suggestions = (
    await Promise.all([
      buildVacancySuggestion(units),
      buildRevenueSuggestion(units, propertyById),
      buildRenewalRiskSuggestion(activeTenancies, propertyById, unitPropertyById),
      buildRetentionSuggestion(activeTenancies, propertyById, unitPropertyById, standingByTenant),
      buildTenantAtRiskSuggestion(goodStanding),
      buildLateRentSuggestion(goodStanding),
      buildMaintenanceCapexSuggestion(orgOid, propertyById),
      buildOperatingPerformanceSuggestion(propertyIds, propertyById),
    ])
  ).filter((s): s is AiSuggestion => s !== null);

  if (suggestions.length === 0) {
    suggestions.push({
      text: 'No urgent risk signals in your portfolio right now.',
      type: 'GENERAL',
      reason: 'No vacancy, arrears, expiring-lease, or repeat-maintenance signals were detected in this analysis.',
      sourceData: {},
    });
  }

  return { suggestions };
}

function buildVacancySuggestion(units: any[]): AiSuggestion | null {
  const vacant = units.filter((u) => u.status === 'VACANT');
  if (vacant.length === 0) return null;
  const rate = Math.round((vacant.length / units.length) * 100);
  return {
    text: `${vacant.length} of ${units.length} units (${rate}%) are currently vacant.`,
    type: 'VACANCY',
    reason: 'Based on Unit.status = VACANT across your portfolio.',
    sourceData: { vacantCount: vacant.length, totalUnits: units.length, vacantRate: rate, unitIds: vacant.map((u) => u._id.toString()) },
  };
}

function buildRevenueSuggestion(units: any[], propertyById: Map<string, any>): AiSuggestion | null {
  const underMarket = units.filter((u) => typeof u.marketRent === 'number' && u.marketRent > u.rent);
  if (underMarket.length === 0) return null;
  const gapTotal = underMarket.reduce((s, u) => s + (u.marketRent - u.rent), 0);
  return {
    text: `${underMarket.length} unit${underMarket.length > 1 ? 's are' : ' is'} renting below its recorded market rate by a combined $${gapTotal}/month.`,
    type: 'REVENUE',
    reason: 'Based on Unit.rent compared to Unit.marketRent for units where a market rent has been recorded.',
    sourceData: {
      gapTotal,
      units: underMarket.map((u) => ({
        unitId: u._id.toString(),
        propertyName: propertyById.get(u.propertyId.toString())?.name ?? null,
        rent: u.rent,
        marketRent: u.marketRent,
        gap: u.marketRent - u.rent,
      })),
    },
  };
}

function buildRenewalRiskSuggestion(
  activeTenancies: any[],
  propertyById: Map<string, any>,
  unitPropertyById: Map<string, string>
): AiSuggestion | null {
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const expiring = activeTenancies.filter((t) => t.leaseEnd && new Date(t.leaseEnd) <= in30 && new Date(t.leaseEnd) >= now);
  if (expiring.length === 0) return null;
  return {
    text: `${expiring.length} lease${expiring.length > 1 ? 's' : ''} expire${expiring.length > 1 ? '' : 's'} within the next 30 days.`,
    type: 'RENEWAL_RISK',
    reason: 'Based on active tenancies with a leaseEnd date within 30 days.',
    sourceData: {
      count: expiring.length,
      tenancies: expiring.map((t) => ({
        tenancyId: t._id.toString(),
        tenantUserId: t.tenantUserId.toString(),
        leaseEnd: new Date(t.leaseEnd).toISOString(),
        propertyName: propertyById.get(unitPropertyById.get(t.unitId.toString()) ?? '')?.name ?? null,
      })),
    },
  };
}

function buildRetentionSuggestion(
  activeTenancies: any[],
  propertyById: Map<string, any>,
  unitPropertyById: Map<string, string>,
  standingByTenant: Map<string, { status: string }>
): AiSuggestion | null {
  const now = new Date();
  const in60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const candidates = activeTenancies.filter((t) => {
    if (!t.leaseEnd) return false;
    const end = new Date(t.leaseEnd);
    if (end < now || end > in60) return false;
    const standing = standingByTenant.get(t.tenantUserId.toString());
    return standing?.status === 'ACTIVE';
  });
  if (candidates.length === 0) return null;
  return {
    text: `${candidates.length} tenant${candidates.length > 1 ? 's' : ''} in good standing have leases expiring within 60 days.`,
    type: 'RETENTION',
    reason: 'Based on tenants with Good Standing status ACTIVE whose lease ends within 60 days — reliable tenants worth prioritizing for renewal outreach.',
    sourceData: {
      count: candidates.length,
      tenancies: candidates.map((t) => ({
        tenancyId: t._id.toString(),
        tenantUserId: t.tenantUserId.toString(),
        leaseEnd: new Date(t.leaseEnd).toISOString(),
        propertyName: propertyById.get(unitPropertyById.get(t.unitId.toString()) ?? '')?.name ?? null,
      })),
    },
  };
}

function buildTenantAtRiskSuggestion(
  goodStanding: Awaited<ReturnType<typeof listGoodStandingForOrg>>
): AiSuggestion | null {
  const atRisk = goodStanding.filter((g) => g.status === 'AT_RISK' || g.status === 'PAUSED' || g.status === 'SUSPENDED');
  if (atRisk.length === 0) return null;
  return {
    text: `${atRisk.length} tenant${atRisk.length > 1 ? 's are' : ' is'} flagged in Good Standing (${[...new Set(atRisk.map((g) => g.status))].join(', ')}).`,
    type: 'TENANT_AT_RISK',
    reason: 'Based on Good Standing status computed from rent arrears and active flags.',
    sourceData: {
      count: atRisk.length,
      tenants: atRisk.map((g) => ({
        tenantUserId: g.tenantUserId,
        propertyName: g.propertyName,
        status: g.status,
        reasons: g.reasons,
      })),
    },
  };
}

function buildLateRentSuggestion(
  goodStanding: Awaited<ReturnType<typeof listGoodStandingForOrg>>
): AiSuggestion | null {
  const late = goodStanding.filter((g) => g.arrearsDays > 0);
  if (late.length === 0) return null;
  const maxDays = Math.max(...late.map((g) => g.arrearsDays));
  return {
    text: `${late.length} tenant${late.length > 1 ? 's are' : ' is'} behind on rent (up to ${maxDays} days late).`,
    type: 'LATE_RENT',
    reason: 'Based on the latest recorded arrearsDays per unit.',
    sourceData: {
      count: late.length,
      maxDaysLate: maxDays,
      tenants: late.map((g) => ({ tenantUserId: g.tenantUserId, propertyName: g.propertyName, arrearsDays: g.arrearsDays })),
    },
  };
}

async function buildMaintenanceCapexSuggestion(
  orgOid: mongoose.Types.ObjectId,
  propertyById: Map<string, any>
): Promise<AiSuggestion | null> {
  const since = new Date();
  since.setMonth(since.getMonth() - MAINTENANCE_LOOKBACK_MONTHS);

  const rows = await MaintenanceTicketModel.aggregate<{
    _id: mongoose.Types.ObjectId;
    count: number;
    propertyId: mongoose.Types.ObjectId;
    issueTypes: string[];
  }>([
    { $match: { orgId: orgOid, unitId: { $ne: null }, createdAt: { $gte: since } } },
    {
      $group: {
        _id: '$unitId',
        count: { $sum: 1 },
        propertyId: { $first: '$propertyId' },
        issueTypes: { $push: '$issueType' },
      },
    },
    { $match: { count: { $gte: MAINTENANCE_REPEAT_THRESHOLD } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
  ]);

  if (rows.length === 0) return null;

  const topUnit = rows[0];
  const topIssueType = mostFrequent(topUnit.issueTypes);

  return {
    text: `${rows.length} unit${rows.length > 1 ? 's have' : ' has'} had ${MAINTENANCE_REPEAT_THRESHOLD}+ maintenance tickets in the last ${MAINTENANCE_LOOKBACK_MONTHS} months — the top one has ${topUnit.count} tickets, mostly ${topIssueType}.`,
    type: 'MAINTENANCE_CAPEX',
    reason: `Based on repeat MaintenanceTicket volume per unit over the last ${MAINTENANCE_LOOKBACK_MONTHS} months.`,
    sourceData: {
      lookbackMonths: MAINTENANCE_LOOKBACK_MONTHS,
      repeatThreshold: MAINTENANCE_REPEAT_THRESHOLD,
      units: rows.map((r) => ({
        unitId: r._id.toString(),
        propertyName: propertyById.get(r.propertyId?.toString())?.name ?? null,
        ticketCount: r.count,
        topIssueType: mostFrequent(r.issueTypes),
      })),
    },
  };
}

function mostFrequent(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'GENERAL';
}

async function buildOperatingPerformanceSuggestion(
  propertyIds: mongoose.Types.ObjectId[],
  propertyById: Map<string, any>
): Promise<AiSuggestion | null> {
  const units = await UnitModel.find({ propertyId: { $in: propertyIds } }).lean();
  const unitIds = units.map((u: any) => u._id);
  const unitPropertyById = new Map(units.map((u: any) => [u._id.toString(), u.propertyId.toString()]));

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const financials = await UnitFinancialsModel.find({ unitId: { $in: unitIds }, month }).lean();
  if (financials.length === 0) return null;

  const byProperty = new Map<string, { scheduled: number; collected: number }>();
  for (const f of financials as any[]) {
    const propId = unitPropertyById.get(f.unitId.toString());
    if (!propId) continue;
    const bucket = byProperty.get(propId) ?? { scheduled: 0, collected: 0 };
    bucket.scheduled += f.rentScheduled;
    bucket.collected += f.rentCollected;
    byProperty.set(propId, bucket);
  }

  const underperforming = [...byProperty.entries()]
    .map(([propId, b]) => ({
      propertyId: propId,
      propertyName: propertyById.get(propId)?.name ?? null,
      collectionRate: b.scheduled > 0 ? Math.round((b.collected / b.scheduled) * 100) : 100,
    }))
    .filter((p) => p.collectionRate < 90);

  if (underperforming.length === 0) return null;

  return {
    text: `${underperforming.length} propert${underperforming.length > 1 ? 'ies have' : 'y has'} a rent collection rate below 90% this month.`,
    type: 'OPERATING_PERFORMANCE',
    reason: `Based on ${month} rentCollected vs rentScheduled per property.`,
    sourceData: { month, properties: underperforming },
  };
}
