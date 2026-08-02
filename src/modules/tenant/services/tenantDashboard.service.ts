import mongoose from 'mongoose';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { UnitModel } from '../../units/models/unit.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { CreditAccountModel } from '../../ledger/models/creditAccountModel';
import { CreditEventModel } from '../../ledger/models/creditEventModel';
import { CreditEventType } from '../../ledger/types/creditEventTypes';
import { getBalance } from '../../ledger/services/balanceService';
import { PaymentModel } from '../../payments/models/payment.model';
import { TokenLedgerEntryModel } from '../../ledger/models/tokenLedgerEntry.model';
import { CapTableSnapshotModel } from '../../cap-table/models/capTableSnapshot.model';
import { MaintenanceTicketModel } from '../../maintenance/models/maintenanceTicket.model';
import { getVestingSummary, computeVesting } from '../../ledger/services/vesting.service';
import { listTokenLedgerEntries } from '../../ledger/services/tokenLedger.service';
import { getTenantAgreements } from '../../agreements/services/agreement.service';

export type DashboardRange = '30d' | '90d' | '1y';

const RANGE_DAYS: Record<DashboardRange, number> = {
  '30d': 30,
  '90d': 90,
  '1y': 365,
};

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function parseRange(range: string | undefined): DashboardRange {
  if (range === '90d' || range === '1y') return range;
  return '30d';
}

function getStartDate(range: DashboardRange): Date {
  const d = new Date();
  d.setDate(d.getDate() - RANGE_DAYS[range]);
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface TenantDashboardResult {
  tenant: { name: string; unitId: string; propertyId: string } | { name: null; unitId: null; propertyId: null };
  ownershipCredits: { balance: number; earnedToDate: number; earnedThisMonth: number };
  nextPayment: {
    dueDate: string;
    amount: number;
    status: 'DUE' | 'PAID' | 'LATE';
  } | null;
  activitySeries: Array<{ date: string; earned: number; redeemed: number }>;
  // Extended fields for dashboard UI
  tenancy: {
    id: string;
    leaseStart: string;
    leaseEnd: string;
    rentAmount: number;
    status: string;
  } | null;
  property: {
    name: string;
    address: string;
    unitNumber: string;
  } | null;
  maintenanceSummary: {
    totalCount: number;
    resolvedCount: number;
  };
  /** @deprecated use economicParticipation — kept only until the frontend migrates off this key (ticket: avoid "ownership" language). */
  ownershipParticipation: {
    participationPercent: number;
    estimatedValue: number;
    tepaActive: boolean;
  };
  /** Same shape as ownershipParticipation — the "economic participation" naming the TEPA ticket requires (never "ownership"). */
  economicParticipation: {
    participationPercent: number;
    estimatedValue: number;
    tepaActive: boolean;
  };
  pendingCredits: number;
  monthlyGrowth: Array<{ month: string; projected: number; earned: number }>;
  recentPayments: Array<{
    id: string;
    date: string;
    amount: number;
    status: string;
    creditsEarned: number;
  }>;
  participationScore: number;
  /**
   * Rewards Points (RPA) — the SAME data as ownershipCredits/CreditAccountModel,
   * correctly labeled. Fixes a real conflation bug: this dashboard previously
   * called its RPA reward balance "ownershipCredits" as if it were TEPA equity,
   * and had no separate TEPA data at all.
   */
  rewardsPoints: { balance: number; earnedToDate: number; earnedThisMonth: number };
  /** Equity Credits (TEPA) — real vesting/token-ledger data, null if the tenant has no TEPA participation. */
  equityCredits: {
    totalTokens: number;
    vestedTokens: number;
    unvestedTokens: number;
    tokenValueUsd: number;
    vestedValueUsd: number;
    tepaAgreementActive: boolean;
  } | null;
  /** Change in vested equity credit value over the last 30 days, from token accumulation (not property valuation swings). */
  estimatedCreditValueChange: { changeUsd: number; changePercent: number | null; periodDays: number } | null;
  /**
   * First-pass "Pathway to Homeownership" metric: vested equity value as a
   * percentage of the property's total valuation. Placeholder formula pending
   * a product-defined milestone/threshold — flagged, not a final spec.
   */
  pathwayToHomeownership: { currentEquityValueUsd: number; propertyValueUsd: number; progressPercent: number } | null;
  documentsStatus: Array<{ agreementType: string; status: string; signedAt: string | null; effectiveDate: string | null }>;
  tokenLedgerPreview: Array<{ type: string; tokens: number; value: number | null; timestamp: string; source: string }>;
}

export async function getTenantDashboard(
  tenantUserId: mongoose.Types.ObjectId,
  rangeParam?: string
): Promise<TenantDashboardResult> {
  const range = parseRange(rangeParam);
  const startDate = getStartDate(range);

  // Resolve tenancy
  const tenancy = await TenancyModel.findOne({
    tenantUserId,
    status: 'ACTIVE',
  }).sort({ createdAt: -1 }).lean().exec();

  let unitId: string | null = null;
  let propertyId: string | null = null;
  let propertyName = '';
  let propertyAddress = '';
  let unitNumber = '';

  if (tenancy) {
    unitId = tenancy.unitId.toString();
    const unit = await UnitModel.findById(tenancy.unitId).lean();
    if (unit) {
      unitNumber = (unit as any).unitNumber ?? (unit as any).label ?? '';
      if (unit.propertyId) {
        propertyId = unit.propertyId.toString();
        const property = await PropertyModel.findById(unit.propertyId).lean();
        if (property) {
          propertyName = property.name;
          const addr = (property as any).address ?? {};
          propertyAddress = [addr.line1, addr.city, addr.state].filter(Boolean).join(', ');
        }
      }
    }
  }

  const tenantBlock =
    unitId && propertyId
      ? { name: propertyName, unitId, propertyId }
      : { name: null as null, unitId: null as null, propertyId: null as null };

  // Credit accounts
  const accounts = await CreditAccountModel.find({ tenantUserId }).lean();
  const accountIds = accounts.map((a) => (a as any)._id);

  let balance = 0;
  let earnedToDate = 0;
  let earnedThisMonth = 0;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  if (accountIds.length > 0) {
    for (const aid of accountIds) {
      balance += await getBalance(aid);
    }

    const earnEvents = await CreditEventModel.find({
      accountId: { $in: accountIds },
      type: CreditEventType.CREDIT,
    }).lean();

    for (const e of earnEvents) {
      earnedToDate += e.amount;
      if (e.occurredAt >= monthStart) {
        earnedThisMonth += e.amount;
      }
    }
  }

  // Next payment
  let nextPayment: TenantDashboardResult['nextPayment'] = null;
  const nextDue = await PaymentModel.findOne({
    tenantUserId,
    status: { $in: ['DUE', 'LATE'] },
  }).sort({ dueDate: 1 }).lean();

  if (nextDue) {
    nextPayment = {
      dueDate: (nextDue.dueDate as Date).toISOString().slice(0, 10),
      amount: nextDue.amount,
      status: nextDue.status as 'DUE' | 'LATE',
    };
  }

  // Activity series
  const activitySeries: Array<{ date: string; earned: number; redeemed: number }> = [];
  if (accountIds.length > 0) {
    const events = await CreditEventModel.find({
      accountId: { $in: accountIds },
      occurredAt: { $gte: startDate },
      type: { $in: [CreditEventType.CREDIT, CreditEventType.REDEMPTION] },
    }).lean();

    const byDate: Record<string, { earned: number; redeemed: number }> = {};
    const endDate = new Date();
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      byDate[key] = { earned: 0, redeemed: 0 };
    }
    for (const e of events) {
      const key = (e.occurredAt as Date).toISOString().slice(0, 10);
      if (!byDate[key]) byDate[key] = { earned: 0, redeemed: 0 };
      if (e.type === CreditEventType.CREDIT) byDate[key].earned += e.amount;
      if (e.type === CreditEventType.REDEMPTION) byDate[key].redeemed += e.amount;
    }
    Object.keys(byDate).sort().forEach(date => {
      activitySeries.push({ date, earned: byDate[date].earned, redeemed: byDate[date].redeemed });
    });
  }

  // Monthly growth chart (last 6 months)
  const monthlyGrowth: Array<{ month: string; projected: number; earned: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    let monthEarned = 0;
    if (accountIds.length > 0) {
      const evts = await CreditEventModel.find({
        accountId: { $in: accountIds },
        type: CreditEventType.CREDIT,
        occurredAt: { $gte: d, $lt: nextMonth },
      }).lean();
      monthEarned = evts.reduce((s, e) => s + e.amount, 0);
    }
    monthlyGrowth.push({
      month: MONTHS_SHORT[d.getMonth()],
      projected: Math.round(monthEarned * 1.15) || 0,
      earned: monthEarned,
    });
  }

  // Maintenance summary from real model
  let maintenanceSummary = { totalCount: 0, resolvedCount: 0 };
  try {
    const filter: any = { tenantUserId };
    const allTickets = await MaintenanceTicketModel.find(filter).lean();
    maintenanceSummary = {
      totalCount: allTickets.length,
      resolvedCount: allTickets.filter((t: any) => t.status === 'RESOLVED' || t.status === 'CLOSED').length,
    };
  } catch { /* model may not have documents yet */ }

  // Ownership participation % from CapTable or TokenLedger
  let ownershipParticipation = { participationPercent: 0, estimatedValue: 0, tepaActive: false };
  if (propertyId) {
    try {
      const capTable = await CapTableSnapshotModel.findOne({
        propertyId: new mongoose.Types.ObjectId(propertyId),
      }).lean();
      if (capTable && capTable.tenantBreakdown.length > 0) {
        const tenantRow = capTable.tenantBreakdown.find(
          (r) => r.entityId === tenantUserId.toString()
        );
        if (tenantRow) {
          const property = await PropertyModel.findById(propertyId).lean();
          const valuationUsd = (property as any)?.valuationUsd ?? 0;
          ownershipParticipation = {
            participationPercent: Math.round(tenantRow.ownershipPct * 1000) / 1000,
            estimatedValue: Math.round((tenantRow.ownershipPct / 100) * valuationUsd),
            tepaActive: true,
          };
        }
      } else {
        // Fallback: compute from TokenLedgerEntryModel
        const tokenAgg = await TokenLedgerEntryModel.aggregate([
          { $match: { tenantId: tenantUserId, propertyId: new mongoose.Types.ObjectId(propertyId) } },
          { $group: { _id: null, total: { $sum: '$tokens' } } },
        ]);
        const tenantTokens = tokenAgg[0]?.total ?? 0;
        const totalTokenAgg = await TokenLedgerEntryModel.aggregate([
          { $match: { propertyId: new mongoose.Types.ObjectId(propertyId) } },
          { $group: { _id: null, total: { $sum: '$tokens' } } },
        ]);
        const totalTokens = totalTokenAgg[0]?.total ?? 0;
        if (tenantTokens > 0 && totalTokens > 0) {
          const pct = (tenantTokens / totalTokens) * 100;
          const property = await PropertyModel.findById(propertyId).lean();
          const valuationUsd = (property as any)?.valuationUsd ?? 0;
          ownershipParticipation = {
            participationPercent: Math.round(pct * 1000) / 1000,
            estimatedValue: Math.round((pct / 100) * valuationUsd),
            tepaActive: tenantTokens > 0,
          };
        }
      }
    } catch { /* cap table may not exist yet */ }
  }

  // Equity Credits (TEPA) — real vesting/token data, kept fully separate from
  // the RPA reward balance above. Also the input for Estimated Credit Value
  // Change and the Pathway to Homeownership placeholder.
  let equityCredits: TenantDashboardResult['equityCredits'] = null;
  let estimatedCreditValueChange: TenantDashboardResult['estimatedCreditValueChange'] = null;
  let pathwayToHomeownership: TenantDashboardResult['pathwayToHomeownership'] = null;
  let documentsStatus: TenantDashboardResult['documentsStatus'] = [];
  let tokenLedgerPreview: TenantDashboardResult['tokenLedgerPreview'] = [];

  if (propertyId && unitId) {
    try {
      const vesting = await getVestingSummary(tenantUserId);
      equityCredits = {
        totalTokens: vesting.totalTokens,
        vestedTokens: vesting.vestedTokens,
        unvestedTokens: vesting.unvestedTokens,
        tokenValueUsd: vesting.tokenValueUsd,
        vestedValueUsd: vesting.vestedValueUsd,
        tepaAgreementActive: vesting.tepaAgreementActive,
      };

      const periodDays = 30;
      const asOfDate = new Date();
      asOfDate.setDate(asOfDate.getDate() - periodDays);
      const priorEntries = await TokenLedgerEntryModel.find({
        tenantId: tenantUserId,
        propertyId: new mongoose.Types.ObjectId(propertyId),
        timestamp: { $lt: asOfDate },
      }).select('type tokens timestamp').lean();
      const priorBreakdown = computeVesting(
        priorEntries.map((e: any) => ({ type: e.type, tokens: e.tokens, timestamp: e.timestamp })),
        vesting.vestingMonths,
        asOfDate
      );
      const priorValueUsd = priorBreakdown.vestedTokens * vesting.tokenValueUsd;
      const changeUsd = Math.round((vesting.vestedValueUsd - priorValueUsd) * 100) / 100;
      estimatedCreditValueChange = {
        changeUsd,
        changePercent: priorValueUsd > 0 ? Math.round((changeUsd / priorValueUsd) * 1000) / 10 : null,
        periodDays,
      };

      const property = await PropertyModel.findById(propertyId).lean();
      const propertyValueUsd = (property as any)?.valuationUsd ?? 0;
      pathwayToHomeownership = {
        currentEquityValueUsd: vesting.vestedValueUsd,
        propertyValueUsd,
        progressPercent: propertyValueUsd > 0
          ? Math.round((vesting.vestedValueUsd / propertyValueUsd) * 10000) / 100
          : 0,
      };

      const ledgerPage = await listTokenLedgerEntries({ tenantId: tenantUserId.toString(), propertyId });
      tokenLedgerPreview = ledgerPage.entries.slice(0, 5).map((e: any) => ({
        type: e.type,
        tokens: e.tokens,
        value: e.value ?? null,
        timestamp: new Date(e.timestamp).toISOString(),
        source: e.source,
      }));
    } catch { /* TEPA program may not be enabled for this tenancy */ }
  }

  try {
    const agreements = await getTenantAgreements(tenantUserId);
    documentsStatus = agreements.map((a) => ({
      agreementType: a.agreementType,
      status: a.status,
      signedAt: a.signedAt,
      effectiveDate: a.effectiveDate,
    }));
  } catch { /* no active tenancy — agreements not resolvable */ }

  // Pending credits — credits earned in last 30 days not yet redeemed
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  let pendingCredits = 0;
  if (accountIds.length > 0) {
    const recentEarned = await CreditEventModel.find({
      accountId: { $in: accountIds },
      type: CreditEventType.CREDIT,
      occurredAt: { $gte: thirtyDaysAgo },
    }).lean();
    const recentRedeemed = await CreditEventModel.find({
      accountId: { $in: accountIds },
      type: CreditEventType.REDEMPTION,
      occurredAt: { $gte: thirtyDaysAgo },
    }).lean();
    const earned30d = recentEarned.reduce((s, e) => s + e.amount, 0);
    const redeemed30d = recentRedeemed.reduce((s, e) => s + e.amount, 0);
    pendingCredits = Math.max(0, earned30d - redeemed30d);
  }

  // Recent payments (last 5)
  const recentPaymentsRaw = await PaymentModel.find({ tenantUserId })
    .sort({ paidAt: -1, dueDate: -1 })
    .limit(5)
    .lean();

  const recentPayments = recentPaymentsRaw.map((p) => ({
    id: (p as any)._id.toString(),
    date: ((p.paidAt ?? p.dueDate) as Date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    amount: p.amount,
    status: p.status,
    creditsEarned: (p as any).incentivesEarnedCredits ?? 0,
  }));

  // Participation score (on-time payments + maintenance)
  const totalPayments = await PaymentModel.countDocuments({ tenantUserId });
  const paidOnTime = await PaymentModel.countDocuments({ tenantUserId, status: 'PAID' });
  const onTimeRentScore = totalPayments > 0 ? Math.min(40, Math.round((paidOnTime / totalPayments) * 40)) : 0;
  const maintenanceScore = Math.min(30, maintenanceSummary.resolvedCount * 6);
  const engagementScore = Math.min(30, balance > 0 ? 16 : 0);
  const participationScore = onTimeRentScore + maintenanceScore + engagementScore;

  return {
    tenant: tenantBlock,
    ownershipCredits: { balance, earnedToDate, earnedThisMonth },
    nextPayment,
    activitySeries,
    tenancy: tenancy ? {
      id: (tenancy as any)._id.toString(),
      leaseStart: tenancy.leaseStart.toISOString(),
      leaseEnd: tenancy.leaseEnd.toISOString(),
      rentAmount: tenancy.rentAmount,
      status: tenancy.status,
    } : null,
    property: propertyId ? {
      name: propertyName,
      address: propertyAddress,
      unitNumber,
    } : null,
    maintenanceSummary,
    monthlyGrowth,
    recentPayments,
    participationScore,
    ownershipParticipation,
    economicParticipation: ownershipParticipation,
    pendingCredits,
    rewardsPoints: { balance, earnedToDate, earnedThisMonth },
    equityCredits,
    estimatedCreditValueChange,
    pathwayToHomeownership,
    documentsStatus,
    tokenLedgerPreview,
  };
}
