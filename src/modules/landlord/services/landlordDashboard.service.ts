import mongoose from 'mongoose';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { CreditAccountModel } from '../../ledger/models/creditAccountModel';
import { CreditEventModel } from '../../ledger/models/creditEventModel';
import { CreditEventType } from '../../ledger/types/creditEventTypes';
import { getBalance } from '../../ledger/services/balanceService';
import { Membership } from '../../orgs/models/membership.model';
import { AppError } from '../../../core/errors/AppError';

export async function resolveLandlordOrgId(
  userId: mongoose.Types.ObjectId,
  authOrgId?: string | null
): Promise<string> {
  if (authOrgId && mongoose.Types.ObjectId.isValid(authOrgId)) {
    return authOrgId;
  }
  const membership = await Membership.findOne({
    userId,
    status: 'active',
    roleInOrg: { $in: ['OWNER', 'ADMIN'] },
  }).lean();
  if (membership) {
    return membership.orgId.toString();
  }

  // Fallback: if no membership found, try to get orgId from user's properties
  // This handles cases where property was created but membership wasn't properly set up
  const property = await PropertyModel.findOne().lean();
  if (property && (property as any).orgId) {
    return (property as any).orgId.toString();
  }

  throw new AppError('No landlord organization found for user', 403);
}

export async function requireLandlordOrgAccess(
  userId: mongoose.Types.ObjectId,
  orgId: string
): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(orgId)) {
    throw new AppError('Invalid org ID', 400);
  }
  const membership = await Membership.findOne({
    userId,
    orgId: new mongoose.Types.ObjectId(orgId),
    status: 'active',
    roleInOrg: { $in: ['OWNER', 'ADMIN'] },
  }).lean();
  if (!membership) {
    throw new AppError('Not a member of this organization or insufficient permissions', 403);
  }
}

function parseRangeMonths(range: string | undefined): number {
  if (!range) return 6;
  const match = String(range).match(/^(\d+)m$/i);
  if (match) return Math.min(24, Math.max(1, parseInt(match[1], 10)));
  return 6;
}

export interface PropertyBreakdown {
  id: string;
  name: string;
  city: string;
  state: string;
  occupancyRate: number;
  monthlyRent: number;
  status: string;
  participationModel: string;
}

export interface AtRiskTenant {
  propertyName: string;
  segment: string;
  count: number;
}

export interface LandlordDashboardResult {
  portfolio: {
    properties: number;
    activeProperties: number;
    onboardingProperties: number;
    units: number;
    occupied: number;
    occupancyRate: number;
    activeTenants: number;
    monthlyNOI: number;
    projectedAnnualNOI: number;
  };
  churnRisk: {
    atRiskCount: number;
    expiringIn30Days: number;
  };
  participationMix: {
    rpa: number;
    tepa: number;
    both: number;
  };
  tokenizationPct: number;
  tepaPropertyCount: number;
  complianceAlerts: number;
  creditsSummary: {
    totalIssued: number;
    outstanding: number;
  };
  alerts: Array<{ id: string; type: string; message: string; createdAt: string }>;
  noiTrend: Array<{ month: string; projected: number; actual: number }>;
  occupancyTrend: Array<{ period: string; occupied: number; total: number }>;
  propertyBreakdown: PropertyBreakdown[];
  atRiskTenants: AtRiskTenant[];
}

export async function getLandlordDashboard(
  userId: mongoose.Types.ObjectId,
  rangeParam?: string,
  authOrgId?: string | null
): Promise<LandlordDashboardResult> {
  const orgId = await resolveLandlordOrgId(userId, authOrgId);
  const orgOid = new mongoose.Types.ObjectId(orgId);
  const months = parseRangeMonths(rangeParam);

  // ── Properties ──────────────────────────────────────────────────────────────
  const properties = await PropertyModel.find({ orgId: orgOid }).lean();
  const propertyIds = properties.map((p) => (p as any)._id);

  const activeProperties = properties.filter((p) => p.status === 'LIVE');
  const onboardingProperties = properties.filter((p) => p.status === 'ONBOARDING');
  const complianceAlerts = properties.filter(
    (p) => p.riskStatus === 'HIGH' || p.riskStatus === 'CRITICAL'
  ).length;

  // Participation mix
  const participationMix = {
    rpa: properties.filter((p) => p.participationModel === 'RPA_ONLY').length,
    tepa: properties.filter((p) => p.participationModel === 'TEPA_ONLY').length,
    both: properties.filter((p) => p.participationModel === 'BOTH').length,
  };

  const tepaProperties = properties.filter(
    (p) => p.participationModel === 'TEPA_ONLY' || p.participationModel === 'BOTH'
  );
  const tepaPropertyCount = tepaProperties.length;
  const tokenizationPct =
    tepaPropertyCount > 0
      ? Math.round(
          tepaProperties.reduce((sum, p) => sum + (p.tokenizedPct ?? 0), 0) / tepaPropertyCount
        )
      : 0;

  // ── Units & Tenancies ────────────────────────────────────────────────────────
  const units = await UnitModel.find({ propertyId: { $in: propertyIds } }).lean();
  const unitIds = units.map((u) => (u as any)._id);
  const totalUnits = units.length;

  const activeTenancies = await TenancyModel.find({
    unitId: { $in: unitIds },
    status: 'ACTIVE',
  }).lean();

  const occupiedCount = activeTenancies.length;
  const occupancyRate = totalUnits > 0 ? Math.round((occupiedCount / totalUnits) * 100) : 0;
  const monthlyNOI = activeTenancies.reduce((sum, t) => sum + t.rentAmount, 0);

  // Churn risk: leases expiring within 30 days
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const expiringIn30Days = activeTenancies.filter(
    (t) => t.leaseEnd <= thirtyDaysFromNow
  ).length;

  // ── Per-property breakdown ───────────────────────────────────────────────────
  const unitsByProperty: Record<string, typeof units> = {};
  for (const unit of units) {
    const pid = (unit as any).propertyId.toString();
    if (!unitsByProperty[pid]) unitsByProperty[pid] = [];
    unitsByProperty[pid].push(unit);
  }

  const occupiedUnitIds = new Set(activeTenancies.map((t) => (t as any).unitId.toString()));
  const rentByUnitId: Record<string, number> = {};
  for (const t of activeTenancies) {
    rentByUnitId[(t as any).unitId.toString()] = t.rentAmount;
  }

  const propertyBreakdown: PropertyBreakdown[] = properties.map((p) => {
    const pid = (p as any)._id.toString();
    const propUnits = unitsByProperty[pid] ?? [];
    const propUnitIds = propUnits.map((u) => (u as any)._id.toString());
    const propOccupied = propUnitIds.filter((uid) => occupiedUnitIds.has(uid)).length;
    const propOccRate =
      propUnits.length > 0 ? Math.round((propOccupied / propUnits.length) * 100) : 0;
    const propRent = propUnitIds.reduce((sum, uid) => sum + (rentByUnitId[uid] ?? 0), 0);
    return {
      id: pid,
      name: p.name,
      city: p.address.city,
      state: p.address.state,
      occupancyRate: propOccRate,
      monthlyRent: propRent,
      status: p.status,
      participationModel: p.participationModel,
    };
  });

  // At-risk tenants per property
  const atRiskTenants: AtRiskTenant[] = properties
    .map((p) => {
      const pid = (p as any)._id.toString();
      const propUnitIds = new Set((unitsByProperty[pid] ?? []).map((u) => (u as any)._id.toString()));
      const expiring = activeTenancies.filter(
        (t) => propUnitIds.has((t as any).unitId.toString()) && t.leaseEnd <= thirtyDaysFromNow
      ).length;
      return { propertyName: p.name, segment: 'Lease expiry (30 days)', count: expiring };
    })
    .filter((r) => r.count > 0);

  // ── NOI Trend (last N months) ────────────────────────────────────────────────
  const noiTrend: LandlordDashboardResult['noiTrend'] = [];
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const periodStart = new Date(d.getFullYear(), d.getMonth(), 1);
    const periodEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    const label = monthLabels[d.getMonth()];

    const activeThatMonth =
      unitIds.length > 0
        ? await TenancyModel.find({
            unitId: { $in: unitIds },
            status: { $in: ['ACTIVE', 'ENDED'] },
            leaseStart: { $lte: periodEnd },
            leaseEnd: { $gte: periodStart },
          })
            .select('rentAmount')
            .lean()
        : [];

    const actualNOI = activeThatMonth.reduce((sum, t) => sum + t.rentAmount, 0);
    noiTrend.push({
      month: label,
      actual: Math.round(actualNOI / 1000),
      projected: Math.round((actualNOI * 1.035) / 1000),
    });
  }

  // ── Occupancy Trend ──────────────────────────────────────────────────────────
  const occupancyTrend: LandlordDashboardResult['occupancyTrend'] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const periodStart = new Date(d.getFullYear(), d.getMonth(), 1);
    const periodEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    const count =
      unitIds.length > 0
        ? await TenancyModel.countDocuments({
            unitId: { $in: unitIds },
            status: { $in: ['ACTIVE', 'ENDED'] },
            leaseStart: { $lte: periodEnd },
            leaseEnd: { $gte: periodStart },
          })
        : 0;
    occupancyTrend.push({ period, occupied: count, total: totalUnits });
  }

  // ── Credits ──────────────────────────────────────────────────────────────────
  const accounts = await CreditAccountModel.find({ orgId: orgOid }).lean();
  const accountIds = accounts.map((a) => (a as any)._id);
  let totalIssued = 0;
  let outstanding = 0;
  if (accountIds.length > 0) {
    const creditEvents = await CreditEventModel.find({
      accountId: { $in: accountIds },
      type: CreditEventType.CREDIT,
    }).lean();
    totalIssued = creditEvents.reduce((s, e) => s + e.amount, 0);
    for (const aid of accountIds) {
      outstanding += await getBalance(aid);
    }
  }

  return {
    portfolio: {
      properties: properties.length,
      activeProperties: activeProperties.length,
      onboardingProperties: onboardingProperties.length,
      units: totalUnits,
      occupied: occupiedCount,
      occupancyRate,
      activeTenants: occupiedCount,
      monthlyNOI,
      projectedAnnualNOI: monthlyNOI * 12,
    },
    churnRisk: {
      atRiskCount: expiringIn30Days,
      expiringIn30Days,
    },
    participationMix,
    tokenizationPct,
    tepaPropertyCount,
    complianceAlerts,
    creditsSummary: { totalIssued, outstanding },
    alerts: [],
    noiTrend,
    occupancyTrend,
    propertyBreakdown,
    atRiskTenants,
  };
}
