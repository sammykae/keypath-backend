import mongoose from 'mongoose';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { UnitFinancialsModel } from '../../finances/models/unitFinancialsModel';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { PropertyFinancingModel } from '../../properties/models/propertyFinancing.model';
import { resolveLandlordOrgId } from './landlordDashboard.service';

export interface PropertyFinancialRow {
  propertyId: string;
  name: string;
  city: string;
  state: string;
  units: number;
  occupied: number;
  scheduled: number;
  collected: number;
  maintenance: number;
  utilities: number;
  pmFeePct: number;
  taxes: number;
  insurance: number;
  debtService: number;
  noi: number;
  collectionRate: number;
}

export interface LandlordFinancesResult {
  month: string;
  availableMonths: string[];
  totals: {
    scheduled: number;
    collected: number;
    noi: number;
    collectionRate: number;
  };
  properties: PropertyFinancialRow[];
  expenseBreakdown: Array<{ name: string; value: number }>;
  debtLadder: Array<{ period: string; balance: number }>;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function getLandlordFinances(
  userId: mongoose.Types.ObjectId,
  month?: string,
  authOrgId?: string | null
): Promise<LandlordFinancesResult> {
  const orgId = await resolveLandlordOrgId(userId, authOrgId);
  const orgOid = new mongoose.Types.ObjectId(orgId);
  const targetMonth = month ?? currentMonth();

  const properties = await PropertyModel.find({ orgId: orgOid }).lean();
  const propertyIds = properties.map((p) => (p as any)._id);

  const units = await UnitModel.find({ propertyId: { $in: propertyIds } }).lean();
  const unitIds = units.map((u) => (u as any)._id);

  // Group units by property
  const unitsByProperty: Record<string, typeof units> = {};
  for (const unit of units) {
    const pid = (unit as any).propertyId.toString();
    if (!unitsByProperty[pid]) unitsByProperty[pid] = [];
    unitsByProperty[pid].push(unit);
  }

  // Active tenancies for occupancy count
  const activeTenancies = await TenancyModel.find({
    unitId: { $in: unitIds },
    status: 'ACTIVE'
  }).lean();
  const occupiedUnitIds = new Set(activeTenancies.map((t) => (t as any).unitId.toString()));

  // Financials for this month
  const financials = await UnitFinancialsModel.find({
    unitId: { $in: unitIds },
    month: targetMonth
  }).lean();

  const financialsByUnit: Record<string, typeof financials[0]> = {};
  for (const f of financials) {
    financialsByUnit[(f as any).unitId.toString()] = f;
  }

  const rows: PropertyFinancialRow[] = properties.map((p) => {
    const pid = (p as any)._id.toString();
    const propUnits = unitsByProperty[pid] ?? [];
    const occupied = propUnits.filter((u) => occupiedUnitIds.has((u as any)._id.toString())).length;

    let rentScheduled = 0, rentCollected = 0, maintenance = 0;
    let utilities = 0, taxesAlloc = 0, insuranceAlloc = 0, debtServiceAlloc = 0;

    for (const unit of propUnits) {
      const uid = (unit as any)._id.toString();
      const f = financialsByUnit[uid];
      if (f) {
        rentScheduled += f.rentScheduled;
        rentCollected += f.rentCollected;
        maintenance += f.maintenance;
        utilities += f.utilities;
        taxesAlloc += f.taxesAlloc;
        insuranceAlloc += f.insuranceAlloc;
        debtServiceAlloc += f.debtServiceAlloc;
      } else {
        // Fallback: use unit rent for scheduled, 0 for collected (no financial record)
        rentScheduled += unit.rent ?? 0;
      }
    }

    const expenses = maintenance + utilities + taxesAlloc + insuranceAlloc + debtServiceAlloc;
    const noi = rentCollected - expenses;
    const collectionRate = rentScheduled > 0 ? Math.round((rentCollected / rentScheduled) * 100) : 0;

    return {
      propertyId: pid,
      name: p.name,
      city: p.address.city,
      state: p.address.state,
      units: propUnits.length,
      occupied,
      scheduled: rentScheduled,
      collected: rentCollected,
      maintenance,
      utilities,
      pmFeePct: 0,
      taxes: taxesAlloc,
      insurance: insuranceAlloc,
      debtService: debtServiceAlloc,
      noi,
      collectionRate
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      scheduled: acc.scheduled + r.scheduled,
      collected: acc.collected + r.collected,
      noi: acc.noi + r.noi,
      collectionRate: 0
    }),
    { scheduled: 0, collected: 0, noi: 0, collectionRate: 0 }
  );
  totals.collectionRate =
    totals.scheduled > 0
      ? Math.round((totals.collected / totals.scheduled) * 100)
      : 0;

  // ── Available months ───────────────────────────────────────────────────────
  const distinctMonths = await UnitFinancialsModel.distinct('month', {
    unitId: { $in: unitIds }
  });
  const availableMonths = (distinctMonths as string[]).sort().reverse();

  // ── Expense breakdown pie ──────────────────────────────────────────────────
  const totMaintenance = rows.reduce((s, r) => s + r.maintenance, 0);
  const totUtilities = rows.reduce((s, r) => s + r.utilities, 0);
  const totPmFee = rows.reduce((s, r) => s + (r.collected * r.pmFeePct) / 100, 0);
  const totDebt = rows.reduce((s, r) => s + r.debtService, 0);
  const totTaxIns = rows.reduce((s, r) => s + r.taxes + r.insurance, 0);
  const totOpEx = totMaintenance + totUtilities + totPmFee + totDebt + totTaxIns;

  const expenseBreakdown = totOpEx > 0 ? [
    { name: 'Maintenance', value: Math.round((totMaintenance / totOpEx) * 100) },
    { name: 'Utilities', value: Math.round((totUtilities / totOpEx) * 100) },
    { name: 'PM Fee', value: Math.round((totPmFee / totOpEx) * 100) },
    { name: 'Debt Service', value: Math.round((totDebt / totOpEx) * 100) },
    { name: 'Taxes/Insurance', value: Math.round((totTaxIns / totOpEx) * 100) },
  ] : [];

  // ── Debt maturity ladder ───────────────────────────────────────────────────
  const financingRecords = await PropertyFinancingModel.find({ orgId: orgOid }).lean();
  const quarterMap = new Map<string, number>();
  for (const f of financingRecords as any[]) {
    const d = new Date(f.maturityDate);
    const q = `${d.getFullYear()} Q${Math.ceil((d.getMonth() + 1) / 3)}`;
    quarterMap.set(q, (quarterMap.get(q) ?? 0) + f.outstandingBalance);
  }
  const debtLadder = Array.from(quarterMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, balance]) => ({ period, balance }));

  return { month: targetMonth, availableMonths, totals, properties: rows, expenseBreakdown, debtLadder };
}
