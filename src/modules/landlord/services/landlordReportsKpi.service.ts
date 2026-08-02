import mongoose from 'mongoose';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { UnitFinancialsModel } from '../../finances/models/unitFinancialsModel';
import { PropertyFinancingModel } from '../../properties/models/propertyFinancing.model';
import { TokenLedgerModel } from '../../tokens/models/tokenLedgerModel';
import { TenantParticipationModel } from '../../tenant-participation/models/tenantParticipation.model';
import { CampaignModel } from '../../campaign/models/campaign.model';
import { getCampaignMetricsMap } from '../../campaign/services/campaignMetrics.service';
import { resolveLandlordOrgId } from './landlordDashboard.service';
import { parseReportRange, monthKeysInRange, ReportRange } from '../utils/reportRange.util';

/**
 * Consolidated JSON KPI payload for the P2 "Reports page" — Occupancy, NOI/Expenses,
 * Lease Exposure, Tenant Participation, Rewards Budget vs Spent, Debt Maturity Ladder,
 * and Portfolio Summary, all scoped to the caller's org and filterable by the ticket's
 * three time filters. Kept separate from getLandlordReports() (landlordReports.service.ts)
 * so the already-shipped, already-consumed /api/landlord/reports contract is untouched;
 * this is the new endpoint the reworked Reports page should read from.
 */
export async function getLandlordReportKpis(
  userId: mongoose.Types.ObjectId,
  rangeParam: string | undefined,
  authOrgId?: string | null
) {
  const range = parseReportRange(rangeParam);
  const orgId = await resolveLandlordOrgId(userId, authOrgId);
  const orgOid = new mongoose.Types.ObjectId(orgId);

  const properties = await PropertyModel.find({ orgId: orgOid }).lean();
  const propertyIds = properties.map((p) => (p as any)._id);
  const propertyById = new Map(properties.map((p: any) => [p._id.toString(), p]));

  const units = await UnitModel.find({ propertyId: { $in: propertyIds } }).lean();
  const unitIds = units.map((u) => (u as any)._id);

  const tenancies = await TenancyModel.find({ unitId: { $in: unitIds } }).lean();
  const activeTenancies = tenancies.filter((t: any) => t.status === 'ACTIVE');
  const tenantUserIds = [...new Set(activeTenancies.map((t: any) => t.tenantUserId.toString()))];

  const unitPropertyById = new Map(units.map((u: any) => [u._id.toString(), u.propertyId.toString()]));

  const [occupancy, noiExpenses, leaseExposure, tenantParticipation, rewardsBudget, debtMaturityLadder] =
    await Promise.all([
      buildOccupancy(units, activeTenancies, range),
      buildNoiExpenses(unitIds, range),
      buildLeaseExposure(activeTenancies, unitPropertyById, propertyById, range),
      buildTenantParticipation(properties, tenancies, orgOid),
      buildRewardsBudget(orgOid),
      buildDebtMaturityLadder(orgOid),
    ]);

  const portfolioSummary = {
    totalProperties: properties.length,
    activeProperties: properties.filter((p: any) => p.status === 'LIVE').length,
    onboardingProperties: properties.filter((p: any) => p.status === 'ONBOARDING').length,
    totalUnits: units.length,
    occupiedUnits: occupancy.current.occupied,
    occupancyRate: occupancy.current.occupancyRate,
    activeTenants: tenantUserIds.length,
  };

  return {
    generatedAt: new Date().toISOString(),
    range: { label: range.label, from: range.from.toISOString(), to: range.to.toISOString() },
    occupancy,
    noiExpenses,
    leaseExposure,
    tenantParticipation,
    rewardsBudget,
    debtMaturityLadder,
    portfolioSummary,
    /** No named-investor/owner entity exists in this product (only a pooled, anonymous
     * LANDLORD/TENANT/INVESTOR token-ledger split, already surfaced under
     * tenantParticipation.equityCreditsMix) — explicitly null rather than fabricated. */
    investorOwnerMix: null,
  };
}

/**
 * Drilldown for "clicking an occupancy segment" — org-wide (not per-property, unlike the
 * existing GET /api/landlord/properties/:propertyId/units), filtered by Unit.status.
 */
export async function listOrgUnitsByStatus(
  userId: mongoose.Types.ObjectId,
  status: 'VACANT' | 'OCCUPIED' | 'TURN' | 'OFFLINE',
  authOrgId?: string | null
) {
  const orgId = await resolveLandlordOrgId(userId, authOrgId);
  const orgOid = new mongoose.Types.ObjectId(orgId);

  const properties = await PropertyModel.find({ orgId: orgOid }).select('_id name').lean();
  const propertyIds = properties.map((p: any) => p._id);
  const propertyById = new Map(properties.map((p: any) => [p._id.toString(), p.name]));

  const units = await UnitModel.find({ propertyId: { $in: propertyIds }, status }).lean();

  return units.map((u: any) => ({
    unitId: u._id.toString(),
    unitNumber: u.unitNumber,
    propertyId: u.propertyId.toString(),
    propertyName: propertyById.get(u.propertyId.toString()) ?? null,
    status: u.status,
    rent: u.rent,
  }));
}

async function buildOccupancy(units: any[], activeTenancies: any[], range: ReportRange) {
  const occupiedUnitIds = new Set(activeTenancies.map((t) => t.unitId.toString()));

  const byStatus = { VACANT: 0, OCCUPIED: 0, TURN: 0, OFFLINE: 0 };
  for (const u of units) {
    if (byStatus[u.status as keyof typeof byStatus] !== undefined) byStatus[u.status as keyof typeof byStatus]++;
  }
  const total = units.length;
  const occupied = occupiedUnitIds.size;
  const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;

  // Trend: one point per month in range, using each tenancy's active window as of that month.
  const monthKeys = monthKeysInRange(range.from, range.to);
  const trend = monthKeys.map((key) => {
    const [y, m] = key.split('-').map(Number);
    const asOf = new Date(y, m, 0); // last day of that month
    const occupiedAsOf = activeTenancies.filter((t) => {
      const start = new Date(t.leaseStart);
      const end = t.leaseEnd ? new Date(t.leaseEnd) : null;
      return start <= asOf && (!end || end >= asOf);
    }).length;
    return { period: key, occupied: occupiedAsOf, total };
  });

  return {
    current: {
      /** Derived from active tenancies — matches the "occupied" convention used
       * everywhere else in this codebase (landlordReports/landlordDashboard). */
      occupied,
      total,
      occupancyRate,
      /** Raw Unit.status breakdown — distinguishes turn/offline from vacant,
       * which the tenancy-derived occupied count alone cannot. */
      byUnitStatus: byStatus,
    },
    trend,
  };
}

async function buildNoiExpenses(unitIds: mongoose.Types.ObjectId[], range: ReportRange) {
  const monthKeys = monthKeysInRange(range.from, range.to);
  const financials = await UnitFinancialsModel.find({
    unitId: { $in: unitIds },
    month: { $in: monthKeys },
  }).lean();

  const byMonth = new Map<string, { income: number; expenses: number }>();
  for (const key of monthKeys) byMonth.set(key, { income: 0, expenses: 0 });

  for (const f of financials as any[]) {
    const bucket = byMonth.get(f.month);
    if (!bucket) continue;
    bucket.income += f.rentCollected;
    bucket.expenses += f.maintenance + f.utilities + f.taxesAlloc + f.insuranceAlloc + f.debtServiceAlloc;
  }

  const trend = monthKeys.map((period) => {
    const b = byMonth.get(period)!;
    return { period, income: b.income, expenses: b.expenses, noi: b.income - b.expenses };
  });

  const totMaintenance = (financials as any[]).reduce((s, f) => s + f.maintenance, 0);
  const totUtilities = (financials as any[]).reduce((s, f) => s + f.utilities, 0);
  const totDebt = (financials as any[]).reduce((s, f) => s + f.debtServiceAlloc, 0);
  const totTaxIns = (financials as any[]).reduce((s, f) => s + f.taxesAlloc + f.insuranceAlloc, 0);
  const totOpEx = totMaintenance + totUtilities + totDebt + totTaxIns;

  const expenseBreakdown = totOpEx > 0
    ? [
        { name: 'Maintenance', value: Math.round((totMaintenance / totOpEx) * 100) },
        { name: 'Utilities', value: Math.round((totUtilities / totOpEx) * 100) },
        { name: 'Debt Service', value: Math.round((totDebt / totOpEx) * 100) },
        { name: 'Taxes/Insurance', value: Math.round((totTaxIns / totOpEx) * 100) },
      ]
    : [];

  const totalIncome = trend.reduce((s, r) => s + r.income, 0);
  const totalExpenses = trend.reduce((s, r) => s + r.expenses, 0);

  return {
    trend,
    expenseBreakdown,
    totals: { income: totalIncome, expenses: totalExpenses, noi: totalIncome - totalExpenses },
  };
}

async function buildLeaseExposure(
  activeTenancies: any[],
  unitPropertyById: Map<string, string>,
  propertyById: Map<string, any>,
  range: ReportRange
) {
  // Forward-looking window sized by the same filter (Last 30/90 Days → next 30/90 days;
  // This Year → through year-end) — lease exposure is inherently a forward-risk metric.
  const now = new Date();
  const horizon = new Date(now.getTime() + range.days * 24 * 60 * 60 * 1000);

  const expiringInWindow = activeTenancies.filter((t) => {
    if (!t.leaseEnd) return false;
    const end = new Date(t.leaseEnd);
    return end >= now && end <= horizon;
  });

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const byMonth: Record<string, number> = {};
  MONTHS.forEach((m) => (byMonth[m] = 0));
  for (const t of activeTenancies) {
    if (!t.leaseEnd) continue;
    const end = new Date(t.leaseEnd);
    const twelveMonthsOut = new Date(now.getFullYear() + 1, now.getMonth(), 1);
    if (end < now || end > twelveMonthsOut) continue;
    byMonth[MONTHS[end.getMonth()]] += 1;
  }
  const expiryTrend = MONTHS.map((month) => ({ month, expiring: byMonth[month] ?? 0 }));

  const expiringList = expiringInWindow
    .sort((a, b) => new Date(a.leaseEnd).getTime() - new Date(b.leaseEnd).getTime())
    .slice(0, 50)
    .map((t) => {
      const propertyId = unitPropertyById.get(t.unitId.toString());
      const propertyName = propertyId ? propertyById.get(propertyId)?.name : null;
      return {
        tenancyId: t._id.toString(),
        tenantUserId: t.tenantUserId.toString(),
        unitId: t.unitId.toString(),
        leaseEnd: new Date(t.leaseEnd).toISOString(),
        propertyName: propertyName ?? null,
      };
    });

  return {
    windowDays: range.days,
    expiringInWindowCount: expiringInWindow.length,
    expiryTrend,
    expiringList,
  };
}

async function buildTenantParticipation(properties: any[], tenancies: any[], orgOid: mongoose.Types.ObjectId) {
  const rpaCount = properties.filter((p) => p.participationModel === 'RPA_ONLY').length;
  const tepaCount = properties.filter((p) => p.participationModel === 'TEPA_ONLY').length;
  const bothCount = properties.filter((p) => p.participationModel === 'BOTH').length;
  const tepaEnabledCount = tepaCount + bothCount;

  const tenancyIds = tenancies.map((t: any) => t._id);
  const participationRows = await TenantParticipationModel.find({ tenancyId: { $in: tenancyIds } }).lean();
  const enrolledCount = participationRows.filter(
    (r: any) => r.rpaEnrollmentStatus === 'ACTIVE' || r.tepaEnrollmentStatus === 'ACTIVE'
  ).length;
  const enrollmentRate = tenancies.length > 0 ? Math.round((enrolledCount / tenancies.length) * 100) : 0;

  const tokenLedgerAgg = await TokenLedgerModel.aggregate([
    { $match: { orgId: orgOid } },
    { $group: { _id: '$allocationPool', total: { $sum: '$delta' } } },
  ]);
  const poolTotals: Record<string, number> = { LANDLORD: 0, TENANT: 0, INVESTOR: 0 };
  for (const row of tokenLedgerAgg) {
    if (row._id && poolTotals[row._id] !== undefined) poolTotals[row._id] = Math.max(0, row.total);
  }
  const grandTotal = Object.values(poolTotals).reduce((s, v) => s + v, 0);
  const equityCreditsMix = grandTotal > 0
    ? [
        { name: 'Landlord', value: Math.round((poolTotals.LANDLORD / grandTotal) * 100) },
        { name: 'Investors', value: Math.round((poolTotals.INVESTOR / grandTotal) * 100) },
        { name: 'Tenants', value: Math.round((poolTotals.TENANT / grandTotal) * 100) },
      ].filter((d) => d.value > 0)
    : null;

  return { rpaCount, tepaCount, bothCount, tepaEnabledCount, enrollmentRate, equityCreditsMix };
}

async function buildRewardsBudget(orgOid: mongoose.Types.ObjectId) {
  const campaigns = await CampaignModel.find({ orgId: orgOid }).lean();
  const ids = campaigns.map((c: any) => c._id);
  const metricsMap = await getCampaignMetricsMap(ids);

  let totalBudgetUsd = 0;
  let totalSpentUsd = 0;
  const byCampaign = campaigns.map((c: any) => {
    const m = metricsMap.get(c._id.toString()) ?? { tokensIssued: 0, participantCount: 0 };
    const cap = c.budgetTokenCap && c.budgetTokenCap > 0 ? c.budgetTokenCap : null;
    const spentUsd = c.budgetUsd != null && cap != null
      ? Math.round((m.tokensIssued / cap) * c.budgetUsd)
      : 0;
    if (c.budgetUsd != null) totalBudgetUsd += c.budgetUsd;
    totalSpentUsd += spentUsd;
    return {
      campaignId: c._id.toString(),
      name: c.name,
      status: c.status,
      budgetUsd: c.budgetUsd ?? null,
      spentUsd,
      tokensIssued: m.tokensIssued,
      participantCount: m.participantCount,
    };
  });

  return {
    totalBudgetUsd,
    totalSpentUsd,
    remainingUsd: Math.max(0, totalBudgetUsd - totalSpentUsd),
    byCampaign,
  };
}

async function buildDebtMaturityLadder(orgOid: mongoose.Types.ObjectId) {
  const financingRecords = await PropertyFinancingModel.find({ orgId: orgOid }).lean();

  const quarterMap = new Map<string, number>();
  for (const f of financingRecords as any[]) {
    const d = new Date(f.maturityDate);
    const q = `${d.getFullYear()} Q${Math.ceil((d.getMonth() + 1) / 3)}`;
    quarterMap.set(q, (quarterMap.get(q) ?? 0) + f.outstandingBalance);
  }
  const ladder = Array.from(quarterMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, balance]) => ({ period, balance }));

  const totalOutstanding = (financingRecords as any[]).reduce((s, f) => s + f.outstandingBalance, 0);
  const totalPrincipal = (financingRecords as any[]).reduce((s, f) => s + f.principal, 0);

  return {
    ladder,
    summary: {
      totalOutstanding,
      totalPrincipal,
      loanCount: financingRecords.length,
    },
  };
}
