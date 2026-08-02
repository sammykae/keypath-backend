import mongoose from 'mongoose';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { CreditAccountModel } from '../../ledger/models/creditAccountModel';
import { getBalance } from '../../ledger/services/balanceService';
import { TokenLedgerModel } from '../../tokens/models/tokenLedgerModel';
import { PropertyFinancingModel } from '../../properties/models/propertyFinancing.model';
import { resolveLandlordOrgId } from './landlordDashboard.service';

export async function getLandlordReports(userId: mongoose.Types.ObjectId) {
  const orgId = await resolveLandlordOrgId(userId);
  const orgOid = new mongoose.Types.ObjectId(orgId);

  const properties = await PropertyModel.find({ orgId: orgOid }).lean();
  const propertyIds = properties.map((p) => (p as any)._id);

  const units = await UnitModel.find({ propertyId: { $in: propertyIds } }).lean();
  const unitIds = units.map((u) => (u as any)._id);

  const activeTenancies = await TenancyModel.find({
    unitId: { $in: unitIds },
    status: 'ACTIVE'
  }).lean();

  const occupiedUnitIds = new Set(activeTenancies.map((t) => (t as any).unitId.toString()));
  const tenantUserIds = [...new Set(activeTenancies.map((t) => (t as any).tenantUserId.toString()))];

  // Lease expiry by month (next 12 months)
  const now = new Date();
  const twelveMonthsOut = new Date(now.getFullYear() + 1, now.getMonth(), 1);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const leaseExpiryByMonth: Record<string, number> = {};
  MONTHS.forEach(m => { leaseExpiryByMonth[m] = 0; });

  for (const t of activeTenancies) {
    const leaseEnd = (t as any).leaseEnd ? new Date((t as any).leaseEnd) : null;
    if (!leaseEnd || leaseEnd < now || leaseEnd > twelveMonthsOut) continue;
    const monthKey = MONTHS[leaseEnd.getMonth()];
    leaseExpiryByMonth[monthKey] = (leaseExpiryByMonth[monthKey] ?? 0) + 1;
  }

  const leaseExpiry = MONTHS.map(month => ({ month, expiring: leaseExpiryByMonth[month] ?? 0 }));

  // Portfolio counts
  const totalProperties = properties.length;
  const activeProperties = properties.filter((p) => (p as any).status === 'LIVE').length;
  const onboardingProperties = properties.filter((p) => (p as any).status === 'ONBOARDING').length;
  const totalUnits = units.length;
  const occupiedUnits = occupiedUnitIds.size;
  const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
  const activeTenants = tenantUserIds.length;

  // Participation mix
  const rpaCount = properties.filter((p) => (p as any).participationModel === 'RPA_ONLY').length;
  const tepaCount = properties.filter((p) => (p as any).participationModel === 'TEPA_ONLY').length;
  const bothCount = properties.filter((p) => (p as any).participationModel === 'BOTH').length;
  const tepaEnabledCount = tepaCount + bothCount;

  // Tokenization
  const tokenizedProperties = properties.filter(
    (p) => (p as any).tokenizedPct > 0
  );
  const avgTokenizedPct = tokenizedProperties.length > 0
    ? Math.round(
        tokenizedProperties.reduce((sum, p) => sum + ((p as any).tokenizedPct ?? 0), 0) /
        tokenizedProperties.length
      )
    : 0;

  // Credits summary
  let totalCreditsIssued = 0;
  let totalCreditsOutstanding = 0;
  for (const tenantUserId of tenantUserIds) {
    const accounts = await CreditAccountModel.find({
      tenantUserId: new mongoose.Types.ObjectId(tenantUserId)
    }).lean();
    for (const account of accounts) {
      const balance = await getBalance((account as any)._id);
      totalCreditsOutstanding += balance;
    }
  }
  totalCreditsIssued = totalCreditsOutstanding;

  // Property breakdown
  const unitsByProperty = new Map<string, typeof units>();
  for (const unit of units) {
    const pid = (unit as any).propertyId.toString();
    if (!unitsByProperty.has(pid)) unitsByProperty.set(pid, []);
    unitsByProperty.get(pid)!.push(unit);
  }

  const tenanciesByUnit = new Map<string, boolean>();
  for (const t of activeTenancies) {
    tenanciesByUnit.set((t as any).unitId.toString(), true);
  }

  const propertyBreakdown = properties.map((p) => {
    const pid = (p as any)._id.toString();
    const propUnits = unitsByProperty.get(pid) ?? [];
    const occupied = propUnits.filter((u) => tenanciesByUnit.has((u as any)._id.toString())).length;
    const rate = propUnits.length > 0 ? Math.round((occupied / propUnits.length) * 100) : 0;
    return {
      propertyId: pid,
      name: (p as any).name,
      city: (p as any).address?.city ?? '',
      state: (p as any).address?.state ?? '',
      status: (p as any).status,
      participationModel: (p as any).participationModel,
      activationStatus: (p as any).activationStatus,
      totalUnits: propUnits.length,
      occupiedUnits: occupied,
      occupancyRate: rate,
      tokenizedPct: (p as any).tokenizedPct ?? 0
    };
  });

  // Compliance summary
  const compliantCount = properties.filter(
    (p) => (p as any).onboardingStatus === 'COMPLETE'
  ).length;
  const pendingCount = properties.filter(
    (p) => (p as any).onboardingStatus === 'IN_PROGRESS'
  ).length;
  const notStartedCount = properties.filter(
    (p) => (p as any).onboardingStatus === 'NOT_STARTED'
  ).length;

  // ── Ownership mix from token ledger ────────────────────────────────────────
  const tokenLedgerAgg = await TokenLedgerModel.aggregate([
    { $match: { orgId: orgOid } },
    { $group: { _id: '$allocationPool', total: { $sum: '$delta' } } },
  ]);

  const poolTotals: Record<string, number> = { LANDLORD: 0, TENANT: 0, INVESTOR: 0 };
  for (const row of tokenLedgerAgg) {
    if (row._id && poolTotals[row._id] !== undefined) {
      poolTotals[row._id] = Math.max(0, row.total);
    }
  }
  const tokenGrandTotal = Object.values(poolTotals).reduce((s, v) => s + v, 0);
  const ownershipMix = tokenGrandTotal > 0
    ? [
        { name: 'Landlord', value: Math.round((poolTotals.LANDLORD / tokenGrandTotal) * 100) },
        { name: 'Investors', value: Math.round((poolTotals.INVESTOR / tokenGrandTotal) * 100) },
        { name: 'Tenants', value: Math.round((poolTotals.TENANT / tokenGrandTotal) * 100) },
      ].filter(d => d.value > 0)
    : null; // null = no token data yet

  // ── Debt maturity ladder from PropertyFinancing ─────────────────────────
  const financingRecords = await PropertyFinancingModel.find({ orgId: orgOid }).lean();

  const quarterMap = new Map<string, number>();
  for (const f of financingRecords) {
    const d = new Date((f as any).maturityDate);
    const q = `${d.getFullYear()} Q${Math.ceil((d.getMonth() + 1) / 3)}`;
    quarterMap.set(q, (quarterMap.get(q) ?? 0) + f.outstandingBalance);
  }
  const debtLadder = Array.from(quarterMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, balance]) => ({ period, balance }));

  return {
    generatedAt: new Date().toISOString(),
    leaseExpiry,
    ownershipMix,
    debtLadder,
    portfolio: {
      totalProperties,
      activeProperties,
      onboardingProperties,
      totalUnits,
      occupiedUnits,
      occupancyRate,
      activeTenants
    },
    participation: {
      rpaCount,
      tepaCount,
      bothCount,
      tepaEnabledCount
    },
    tokenization: {
      tokenizedPropertyCount: tokenizedProperties.length,
      avgTokenizedPct
    },
    credits: {
      totalIssued: totalCreditsIssued,
      outstanding: totalCreditsOutstanding
    },
    compliance: {
      compliantCount,
      pendingCount,
      notStartedCount
    },
    propertyBreakdown
  };
}
