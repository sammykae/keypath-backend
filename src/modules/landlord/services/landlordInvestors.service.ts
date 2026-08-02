import mongoose from 'mongoose';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { TokenLedgerModel } from '../../tokens/models/tokenLedgerModel';
import { UnitFinancialsModel } from '../../finances/models/unitFinancialsModel';
import { PropertyFinancingModel } from '../../properties/models/propertyFinancing.model';
import { resolveLandlordOrgId } from './landlordDashboard.service';

function performanceStatus(occupancyRate: number): string {
  if (occupancyRate >= 80) return 'Performing Well';
  if (occupancyRate >= 50) return 'Needs Attention';
  return 'At Risk';
}

function aiSuggestion(occupancyRate: number, participationModel: string): string {
  if (occupancyRate < 80) {
    return `${100 - occupancyRate}% vacancy detected. A referral rewards campaign could accelerate fill rate.`;
  }
  if (participationModel === 'RPA_ONLY') {
    return 'Enabling TEPA on this property can reduce turnover by up to 30%.';
  }
  return 'Strong occupancy. Lease renewals are your next retention milestone.';
}

const currentYear = new Date().getFullYear();
const yearStart = new Date(`${currentYear}-01-01`);

export async function getLandlordInvestors(userId: mongoose.Types.ObjectId) {
  const orgId = await resolveLandlordOrgId(userId);
  const orgOid = new mongoose.Types.ObjectId(orgId);

  const properties = await PropertyModel.find({ orgId: orgOid }).lean();
  const propertyIds = properties.map((p: any) => p._id);

  const units = await UnitModel.find({ propertyId: { $in: propertyIds } }).lean();
  const unitIds = units.map((u: any) => u._id);

  const unitToProperty = new Map<string, string>();
  for (const u of units as any[]) {
    unitToProperty.set(u._id.toString(), u.propertyId.toString());
  }

  const activeTenancies = await TenancyModel.find({
    unitId: { $in: unitIds }, status: 'ACTIVE'
  }).lean();
  const occupiedUnitIds = new Set(activeTenancies.map((t: any) => t.unitId.toString()));

  // ── Token ledger: LANDLORD pool per property ──────────────────────────────
  const tokenAgg = await TokenLedgerModel.aggregate([
    { $match: { orgId: orgOid, allocationPool: 'LANDLORD' } },
    { $group: { _id: '$propertyId', total: { $sum: '$delta' } } },
  ]);
  const tokensByProperty = new Map<string, number>();
  let totalTokensHeld = 0;
  for (const row of tokenAgg) {
    const val = Math.max(0, row.total);
    tokensByProperty.set(row._id.toString(), val);
    totalTokensHeld += val;
  }

  // ── Unit financials YTD per property ─────────────────────────────────────
  const financials = await UnitFinancialsModel.find({
    unitId: { $in: unitIds },
    createdAt: { $gte: yearStart },
  }).lean();

  const ytdByProperty = new Map<string, number>();
  const allDividendRows: any[] = [];

  for (const f of financials as any[]) {
    const pid = unitToProperty.get(f.unitId.toString());
    if (!pid) continue;
    if (f.rentCollected > 0) {
      ytdByProperty.set(pid, (ytdByProperty.get(pid) ?? 0) + f.rentCollected);
      allDividendRows.push({ ...f, _propertyId: pid });
    }
  }

  // ── Financing records per property ────────────────────────────────────────
  const financingRecords = await PropertyFinancingModel.find({ orgId: orgOid }).lean();
  const financingByProperty = new Map<string, number>();
  for (const f of financingRecords as any[]) {
    const pid = f.propertyId.toString();
    financingByProperty.set(pid, (financingByProperty.get(pid) ?? 0) + f.outstandingBalance);
  }

  // ── Build per-property investment data ───────────────────────────────────
  let totalPortfolioValue = 0;
  let totalDividendsEarned = 0;
  const roiValues: number[] = [];

  const propertyMap = new Map<string, any>();
  for (const p of properties as any[]) { propertyMap.set(p._id.toString(), p); }

  const unitsByProperty = new Map<string, any[]>();
  for (const u of units as any[]) {
    const pid = u.propertyId.toString();
    if (!unitsByProperty.has(pid)) unitsByProperty.set(pid, []);
    unitsByProperty.get(pid)!.push(u);
  }

  const investmentCards = properties.map((p: any) => {
    const pid = p._id.toString();
    const propUnits = unitsByProperty.get(pid) ?? [];
    const occupied = propUnits.filter((u: any) => occupiedUnitIds.has(u._id.toString())).length;
    const occupancyRate = propUnits.length > 0 ? Math.round((occupied / propUnits.length) * 100) : 0;

    const estimatedValue: number = p.valuationUsd ?? 0;
    totalPortfolioValue += estimatedValue;

    const investment = financingByProperty.get(pid) ?? estimatedValue;
    const dividendsYTD = ytdByProperty.get(pid) ?? 0;
    totalDividendsEarned += dividendsYTD;

    const tokensOwned = tokensByProperty.get(pid) ?? 0;
    const tokenizedValue = estimatedValue > 0 && tokensOwned > 0
      ? Math.round((tokensOwned / Math.max(totalTokensHeld, 1)) * estimatedValue)
      : 0;

    const annualRent = dividendsYTD * (12 / Math.max(new Date().getMonth() + 1, 1));
    const roi = investment > 0 ? Math.round((annualRent / investment) * 1000) / 10 : 0;
    if (roi > 0) roiValues.push(roi);

    const addr = p.address ?? {};
    const city = addr.city ?? '';
    const state = addr.state ?? '';

    return {
      propertyId: pid,
      name: p.name,
      city,
      state,
      status: p.status ?? 'ACTIVE',
      participationModel: p.participationModel ?? 'RPA_ONLY',
      suggestion: aiSuggestion(occupancyRate, p.participationModel ?? 'RPA_ONLY'),
      investment,
      currentROI: roi,
      dividendsYTD,
      performanceStatus: performanceStatus(occupancyRate),
      estimatedValue,
      tokensOwned,
      tokenizedValue,
    };
  });

  const avgROI = roiValues.length > 0
    ? Math.round((roiValues.reduce((s, v) => s + v, 0) / roiValues.length) * 10) / 10
    : 0;

  // ── Recent dividends table ────────────────────────────────────────────────
  const recentDividends = allDividendRows
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10)
    .map(f => {
      const prop = propertyMap.get(f._propertyId);
      return {
        date: f.month ?? new Date(f.createdAt).toISOString().slice(0, 7),
        property: prop?.name ?? 'Unknown',
        dividend: f.rentCollected,
        paymentMethod: 'Bank Transfer',
        status: f.paidStatus === 'PAID' ? 'Paid' : f.paidStatus === 'PARTIAL' ? 'Partial' : 'Pending',
      };
    });

  return {
    kpis: {
      portfolioValue: totalPortfolioValue,
      avgROI,
      tokensHeld: totalTokensHeld,
      dividendsEarned: totalDividendsEarned,
    },
    properties: investmentCards,
    dividends: recentDividends,
  };
}
