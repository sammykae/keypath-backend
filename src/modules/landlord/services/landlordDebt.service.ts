import mongoose from 'mongoose';
import { PropertyModel } from '../../properties/models/propertyModel';
import { PropertyFinancingModel } from '../../properties/models/propertyFinancing.model';
import { UnitModel } from '../../units/models/unit.model';
import { UnitFinancialsModel } from '../../finances/models/unitFinancialsModel';
import { CreditAccountModel } from '../../ledger/models/creditAccountModel';
import { getBalance } from '../../ledger/services/balanceService';
import { resolveLandlordOrgId } from './landlordDashboard.service';

const currency = (v: number) =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 });

export async function getLandlordDebt(userId: mongoose.Types.ObjectId) {
  const orgId = await resolveLandlordOrgId(userId);
  const orgOid = new mongoose.Types.ObjectId(orgId);

  const properties = await PropertyModel.find({ orgId: orgOid }).lean();
  const propertyMap = new Map<string, any>();
  for (const p of properties as any[]) propertyMap.set(p._id.toString(), p);

  const financing = await PropertyFinancingModel.find({ orgId: orgOid }).lean();

  // ── Total debt summary ─────────────────────────────────────────────────────
  const totalPrincipal = financing.reduce((s, f) => s + f.principal, 0);
  const totalOutstanding = financing.reduce((s, f) => s + f.outstandingBalance, 0);
  const totalRepaid = totalPrincipal - totalOutstanding;
  const repaymentPct = totalPrincipal > 0 ? Math.round((totalRepaid / totalPrincipal) * 100) : 0;
  const activePropertyIds = new Set(financing.map((f: any) => f.propertyId.toString()));

  // ── Debt summary table rows ────────────────────────────────────────────────
  const COLORS = ['#10B981', '#60A5FA', '#34D399', '#A78BFA', '#F59E0B', '#EF4444'];
  const loanRows = (financing as any[]).map((f, i) => {
    const prop = propertyMap.get(f.propertyId.toString());
    const valuationUsd: number = prop?.valuationUsd ?? 0;
    const ltv = valuationUsd > 0 ? Math.round((f.outstandingBalance / valuationUsd) * 100) : null;
    const monthlyInterest = Math.round((f.outstandingBalance * (f.interestRate ?? 0)) / 100 / 12);
    const maturity = new Date(f.maturityDate);
    const repaidPct = f.principal > 0
      ? Math.round(((f.principal - f.outstandingBalance) / f.principal) * 100)
      : 0;

    return {
      id: f._id.toString(),
      propertyId: f.propertyId.toString(),
      propertyName: prop?.name ?? 'Unknown',
      lenderName: f.lenderName ?? null,
      type: f.type,
      principal: f.principal,
      interestRate: f.interestRate ?? 0,
      outstandingBalance: f.outstandingBalance,
      maturityDate: maturity.toISOString(),
      maturityFormatted: maturity.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      monthlyInterest,
      ltv,
      repaidPct,
      color: COLORS[i % COLORS.length],
    };
  });

  // ── Next upcoming payment (earliest maturity) ──────────────────────────────
  const upcoming = [...loanRows].sort((a, b) =>
    new Date(a.maturityDate).getTime() - new Date(b.maturityDate).getTime()
  )[0] ?? null;

  // ── Repayment progress (donut data) ───────────────────────────────────────
  const donut = loanRows.map(r => ({
    name: r.propertyName,
    value: r.repaidPct,
    color: r.color,
  }));

  // ── Recent EMI payments from UnitFinancials ───────────────────────────────
  const propertyIds = properties.map((p: any) => p._id);
  const units = await UnitModel.find({ propertyId: { $in: propertyIds } }).lean();
  const unitIds = units.map((u: any) => u._id);
  const unitToProperty = new Map<string, string>();
  for (const u of units as any[]) unitToProperty.set(u._id.toString(), u.propertyId.toString());

  const recentFinancials = await UnitFinancialsModel.find({ unitId: { $in: unitIds } })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  const emiRows = recentFinancials
    .filter((f: any) => f.debtServiceAlloc > 0)
    .map((f: any) => {
      const pid = unitToProperty.get(f.unitId.toString());
      const prop = pid ? propertyMap.get(pid) : null;
      return {
        date: f.month,
        property: prop?.name ?? 'Unknown',
        amount: f.debtServiceAlloc,
        status: f.paidStatus === 'PAID' ? 'Paid' : f.paidStatus === 'PARTIAL' ? 'Partial' : 'Pending',
      };
    });

  // ── Landlord credits (rewards) ─────────────────────────────────────────────
  const landlordAccounts = await CreditAccountModel.find({
    tenantUserId: userId
  }).lean();
  let creditsBalance = 0;
  for (const acc of landlordAccounts as any[]) {
    creditsBalance += await getBalance(acc._id);
  }

  // AI suggestion for highest LTV property
  const highLTV = [...loanRows].sort((a, b) => (b.ltv ?? 0) - (a.ltv ?? 0))[0];
  const aiSuggestion = highLTV && highLTV.ltv !== null && highLTV.ltv > 70
    ? `${highLTV.propertyName} LTV ${highLTV.ltv}% → consider refinance; review current rates.`
    : loanRows.length > 0
    ? 'All loans within healthy LTV range. Review maturity dates to plan ahead.'
    : null;

  return {
    summary: {
      totalOutstanding,
      totalPrincipal,
      repaymentPct,
      activePropertyCount: activePropertyIds.size,
    },
    loanRows,
    donut,
    upcoming,
    emiRows,
    creditsBalance,
    aiSuggestion,
  };
}
