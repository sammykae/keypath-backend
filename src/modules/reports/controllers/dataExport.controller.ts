import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import { resolveLandlordOrgId } from '../../landlord/services/landlordDashboard.service';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { User as UserModel } from '../../auth/models/user.model';
import { UnitFinancialsModel } from '../../finances/models/unitFinancialsModel';
import { LoanModel } from '../../loans/models/loanModel';
import { listLandlordTenants } from '../../landlord/services/landlordTenants.service';
import { getLandlordCompliance } from '../../landlord/services/landlordCompliance.service';
import { TokenLedgerEntryModel } from '../../ledger/models/tokenLedgerEntry.model';
import { RedemptionModel } from '../../rewards/models/redemption.model';
import { RewardModel } from '../../rewards/models/reward.model';
import { ActivityModel } from '../../activities/models/activityModel';
import { TenantParticipationModel } from '../../tenant-participation/models/tenantParticipation.model';
import { AgreementModel } from '../../agreements/models/agreement.model';
import { MaintenanceTicketModel, MAINTENANCE_STATUS_LABELS } from '../../maintenance/models/maintenanceTicket.model';
import { getLandlordDebt } from '../../landlord/services/landlordDebt.service';

const VALID_DATASETS = [
  'properties', 'tenants', 'financials', 'loans', 'stakeholders', 'tenant-roster', 'arrears',
  'token-ledger', 'rewards-history', 'compliance', 'activity-log', 'agreement-status', 'maintenance',
  'debt', 'portfolio',
] as const;
type Dataset = typeof VALID_DATASETS[number];

function paymentStatusLabel(arrearsDays: number): string {
  if (arrearsDays <= 0) return 'On Time';
  if (arrearsDays <= 30) return '30 Days Late';
  if (arrearsDays <= 60) return '60 Days Late';
  if (arrearsDays <= 90) return '90 Days Late';
  return '90+ Days Late';
}

function monthsRemaining(leaseEnd: string | null): number {
  if (!leaseEnd) return 0;
  const ms = new Date(leaseEnd).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (30.44 * 24 * 60 * 60 * 1000)));
}

function rpaStatusLabel(participationModel: string): string {
  return participationModel === 'RPA_ONLY' || participationModel === 'BOTH' ? 'Active' : 'None';
}

function tepaStatusLabel(participationModel: string, tepaOptInStatus: string | null): string {
  const tepaEnabled = participationModel === 'TEPA_ONLY' || participationModel === 'BOTH';
  if (!tepaEnabled) return 'None';
  return tepaOptInStatus === 'OPTED_IN' ? 'Active' : 'Pending';
}

async function buildRosterCsv(userId: mongoose.Types.ObjectId, onlyArrears: boolean): Promise<string> {
  const { tenants } = await listLandlordTenants(userId, { hasArrears: onlyArrears || undefined });
  const lines: string[] = [];

  if (onlyArrears) {
    lines.push(csvRow(['TenantName', 'Email', 'Property', 'Unit', 'MonthlyRent', 'ArrearsAmount', 'DaysLate', 'PaymentStatus', 'LeaseEnd']));
    for (const t of tenants) {
      lines.push(csvRow([
        t.name, t.email, t.propertyName, t.unitNumber, t.monthlyRent,
        t.arrearsAmount, t.arrearsDays, paymentStatusLabel(t.arrearsDays),
        t.leaseEnd?.slice(0, 10) ?? '',
      ]));
    }
  } else {
    lines.push(csvRow([
      'TenantName', 'Email', 'Property', 'Unit', 'MonthlyRent',
      'LeaseStart', 'LeaseEnd', 'MonthsRemaining', 'PaymentStatus', 'DaysLate',
      'ArrearsAmount', 'RPAStatus', 'TEPAStatus', 'CreditsBalance',
    ]));
    for (const t of tenants) {
      lines.push(csvRow([
        t.name, t.email, t.propertyName, t.unitNumber, t.monthlyRent,
        t.leaseStart?.slice(0, 10) ?? '', t.leaseEnd?.slice(0, 10) ?? '',
        monthsRemaining(t.leaseEnd), paymentStatusLabel(t.arrearsDays), t.arrearsDays,
        t.arrearsAmount, rpaStatusLabel(t.participationModel),
        tepaStatusLabel(t.participationModel, t.tepaOptInStatus), t.creditsBalance,
      ]));
    }
  }

  return lines.join('\n');
}

function cell(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(cells: unknown[]): string {
  return cells.map(cell).join(',');
}

async function buildCsv(dataset: Dataset, orgOid: mongoose.Types.ObjectId): Promise<string> {
  const lines: string[] = [];

  switch (dataset) {
    case 'properties': {
      const props = await PropertyModel.find({ orgId: orgOid }).lean();
      lines.push(csvRow(['ID', 'Name', 'Type', 'Status', 'City', 'State', 'PostalCode', 'TokenizedPct']));
      for (const p of props as any[]) {
        lines.push(csvRow([
          p._id, p.name ?? '', p.type ?? '', p.status ?? '',
          p.address?.city ?? '', p.address?.state ?? '', p.address?.postalCode ?? '',
          p.tokenizedPct ?? 0,
        ]));
      }
      break;
    }

    case 'tenants': {
      const props = await PropertyModel.find({ orgId: orgOid }, '_id').lean();
      const propIds = props.map((p: any) => p._id);
      const units = await UnitModel.find({ propertyId: { $in: propIds } }, '_id propertyId label').lean();
      const unitIds = units.map((u: any) => u._id);
      const unitMap = new Map(units.map((u: any) => [u._id.toString(), u]));

      const tenancies = await TenancyModel.find({ unitId: { $in: unitIds }, status: 'ACTIVE' }).lean();
      const tenantUserIds = tenancies.map((t: any) => t.tenantUserId);
      const users = await UserModel.find({ _id: { $in: tenantUserIds } }, 'fullName email').lean();
      const userMap = new Map(users.map((u: any) => [u._id.toString(), u]));

      lines.push(csvRow(['TenantID', 'Name', 'Email', 'UnitLabel', 'LeaseStart', 'LeaseEnd', 'Status']));
      for (const t of tenancies as any[]) {
        const u = userMap.get(t.tenantUserId.toString());
        const unit = unitMap.get(t.unitId.toString());
        lines.push(csvRow([
          t.tenantUserId, u?.fullName ?? '', u?.email ?? '',
          unit?.label ?? '', t.leaseStart?.toISOString().slice(0, 10) ?? '',
          t.leaseEnd?.toISOString().slice(0, 10) ?? '', t.status ?? '',
        ]));
      }
      break;
    }

    case 'financials': {
      const props = await PropertyModel.find({ orgId: orgOid }, '_id').lean();
      const propIds = props.map((p: any) => p._id);
      const units = await UnitModel.find({ propertyId: { $in: propIds } }, '_id label').lean();
      const unitIds = units.map((u: any) => u._id);
      const unitMap = new Map(units.map((u: any) => [u._id.toString(), u.label]));

      const financials = await UnitFinancialsModel.find({ unitId: { $in: unitIds } }).sort({ month: -1 }).lean();
      lines.push(csvRow(['UnitID', 'UnitLabel', 'Month', 'RentScheduled', 'RentCollected', 'PaidStatus', 'ArrearsAmount', 'ArrearsDays', 'Maintenance', 'Utilities']));
      for (const f of financials as any[]) {
        lines.push(csvRow([
          f.unitId, unitMap.get(f.unitId.toString()) ?? '', f.month,
          f.rentScheduled, f.rentCollected, f.paidStatus,
          f.arrearsAmount, f.arrearsDays, f.maintenance, f.utilities,
        ]));
      }
      break;
    }

    case 'loans': {
      const props = await PropertyModel.find({ orgId: orgOid }, '_id name').lean();
      const propIds = props.map((p: any) => p._id);
      const propMap = new Map(props.map((p: any) => [p._id.toString(), (p as any).name ?? '']));

      const loans = await LoanModel.find({ propertyId: { $in: propIds } }).lean();
      lines.push(csvRow(['LoanID', 'PropertyName', 'Lender', 'Type', 'RateType', 'Rate', 'OrigBalance', 'CurrentBalance', 'OriginationDate', 'MaturityDate']));
      for (const l of loans as any[]) {
        lines.push(csvRow([
          l._id, propMap.get(l.propertyId.toString()) ?? '', l.lender ?? '',
          l.type ?? '', l.rateType ?? '', l.rate ?? '',
          l.origBalance ?? '', l.currentBalance ?? '',
          l.originationDate?.toISOString().slice(0, 10) ?? '',
          l.maturityDate?.toISOString().slice(0, 10) ?? '',
        ]));
      }
      break;
    }

    case 'stakeholders': {
      lines.push(csvRow(['Note']));
      lines.push(csvRow(['Stakeholder exports are not yet available in this version.']));
      break;
    }
  }

  return lines.join('\n');
}

async function orgTenantContext(orgOid: mongoose.Types.ObjectId) {
  const props = await PropertyModel.find({ orgId: orgOid }, '_id name').lean();
  const propIds = props.map((p: any) => p._id);
  const propNameById = new Map(props.map((p: any) => [p._id.toString(), (p as any).name ?? '']));
  const units = await UnitModel.find({ propertyId: { $in: propIds } }, '_id propertyId label unitNumber').lean();
  const unitById = new Map(units.map((u: any) => [u._id.toString(), u]));
  const tenancies = await TenancyModel.find({ unitId: { $in: units.map((u: any) => u._id) } }).lean();
  const tenantIds = [...new Set(tenancies.map((t: any) => t.tenantUserId.toString()))];
  const users = await UserModel.find(
    { _id: { $in: tenantIds.map((id) => new mongoose.Types.ObjectId(id)) } },
    'email profile.firstName profile.lastName'
  ).lean();
  const userById = new Map(users.map((u: any) => [u._id.toString(), u]));
  const nameOf = (userId: string) => {
    const u: any = userById.get(userId);
    if (!u) return '';
    const n = `${u.profile?.firstName ?? ''} ${u.profile?.lastName ?? ''}`.trim();
    return n || u.email || '';
  };
  return { propIds, propNameById, unitById, tenancies, tenantIds, userById, nameOf };
}

async function buildTokenLedgerCsv(orgOid: mongoose.Types.ObjectId): Promise<string> {
  const { propIds, propNameById, nameOf } = await orgTenantContext(orgOid);
  const entries = await TokenLedgerEntryModel.find({ propertyId: { $in: propIds } })
    .sort({ timestamp: -1 })
    .lean();

  const lines = [csvRow(['Date', 'Tenant', 'Property', 'Type', 'Tokens', 'Value', 'Source'])];
  for (const e of entries as any[]) {
    lines.push(csvRow([
      e.timestamp?.toISOString?.() ?? '',
      nameOf(e.tenantId.toString()),
      propNameById.get(e.propertyId.toString()) ?? '',
      e.type, e.tokens, e.value ?? '', e.source ?? '',
    ]));
  }
  return lines.join('\n');
}

async function buildRewardsHistoryCsv(orgOid: mongoose.Types.ObjectId): Promise<string> {
  const { tenantIds, nameOf } = await orgTenantContext(orgOid);
  const redemptions = await RedemptionModel.find({
    tenantUserId: { $in: tenantIds.map((id) => new mongoose.Types.ObjectId(id)) },
  })
    .sort({ createdAt: -1 })
    .lean();

  const rewardIds = [...new Set(redemptions.map((r: any) => r.rewardId.toString()))];
  const rewards = await RewardModel.find(
    { _id: { $in: rewardIds.map((id) => new mongoose.Types.ObjectId(id)) } },
    'name'
  ).lean();
  const rewardNameById = new Map(rewards.map((r: any) => [r._id.toString(), r.name ?? '']));

  const lines = [csvRow(['Date', 'Tenant', 'Reward', 'Credits', 'ApprovalStatus', 'FulfillmentType', 'FulfillmentStatus'])];
  for (const r of redemptions as any[]) {
    lines.push(csvRow([
      r.createdAt?.toISOString?.() ?? '',
      nameOf(r.tenantUserId.toString()),
      rewardNameById.get(r.rewardId.toString()) ?? '',
      r.amount,
      r.approvalStatus ?? '',
      r.fulfillment?.type ?? '',
      r.fulfillment?.status ?? '',
    ]));
  }
  return lines.join('\n');
}

async function buildComplianceCsv(userId: mongoose.Types.ObjectId): Promise<string> {
  const { properties } = await getLandlordCompliance(userId);
  const lines = [csvRow(['Property', 'City', 'State', 'ParticipationModel', 'OverallStatus', 'Document', 'RequiredFor', 'DocumentStatus', 'UploadedAt', 'Issue'])];
  for (const p of properties) {
    for (const d of p.documents) {
      lines.push(csvRow([
        p.propertyName, p.city, p.state, p.participationModel, p.overallStatus,
        d.documentName, d.requiredFor, d.status, d.uploadedAt ?? '', d.issue ?? '',
      ]));
    }
  }
  return lines.join('\n');
}

async function buildActivityLogCsv(orgOid: mongoose.Types.ObjectId): Promise<string> {
  const activities = await ActivityModel.find({ orgId: orgOid })
    .sort({ createdAt: -1 })
    .limit(5000)
    .lean();

  const actorIds = [...new Set(activities.map((a: any) => a.actorId?.toString()).filter(Boolean))];
  const actors = await UserModel.find(
    { _id: { $in: actorIds.map((id) => new mongoose.Types.ObjectId(id)) } },
    'email profile.firstName profile.lastName'
  ).lean();
  const actorById = new Map(actors.map((u: any) => [u._id.toString(), u]));

  const lines = [csvRow(['Date', 'Action', 'EntityType', 'EntityId', 'Actor', 'Meta'])];
  for (const a of activities as any[]) {
    const actor: any = actorById.get(a.actorId?.toString() ?? '');
    const actorName = actor
      ? (`${actor.profile?.firstName ?? ''} ${actor.profile?.lastName ?? ''}`.trim() || actor.email)
      : '';
    lines.push(csvRow([
      a.createdAt?.toISOString?.() ?? '',
      a.action ?? '',
      a.entity?.type ?? '',
      a.entity?.id?.toString() ?? '',
      actorName,
      a.meta ? JSON.stringify(a.meta) : '',
    ]));
  }
  return lines.join('\n');
}

async function buildMaintenanceCsv(orgOid: mongoose.Types.ObjectId): Promise<string> {
  const { propNameById, nameOf } = await orgTenantContext(orgOid);
  const tickets = await MaintenanceTicketModel.find({ orgId: orgOid })
    .sort({ createdAt: -1 })
    .lean();

  const lines = [csvRow(['Date', 'Tenant', 'Property', 'Title', 'IssueType', 'Severity', 'Status', 'RewardEligible', 'RewardDecision', 'CreditsAwarded', 'ResolvedAt'])];
  for (const t of tickets as any[]) {
    lines.push(csvRow([
      t.createdAt?.toISOString?.() ?? '',
      nameOf(t.tenantUserId.toString()),
      propNameById.get(t.propertyId.toString()) ?? '',
      t.title ?? '',
      t.issueType ?? 'GENERAL',
      t.severity ?? '',
      MAINTENANCE_STATUS_LABELS[t.status as keyof typeof MAINTENANCE_STATUS_LABELS] ?? t.status ?? '',
      t.rewardEligible == null ? '' : t.rewardEligible ? 'Yes' : 'No',
      t.rewardDecision ?? '',
      t.creditsAwarded ?? 0,
      t.resolvedAt?.toISOString?.() ?? '',
    ]));
  }
  return lines.join('\n');
}

export async function buildDebtCsv(userId: mongoose.Types.ObjectId): Promise<string> {
  const { loanRows } = await getLandlordDebt(userId);
  const lines = [csvRow([
    'PropertyName', 'Lender', 'Type', 'Principal', 'InterestRate', 'OutstandingBalance',
    'MonthlyInterest', 'LTV', 'RepaidPct', 'MaturityDate',
  ])];
  for (const l of loanRows) {
    lines.push(csvRow([
      l.propertyName, l.lenderName ?? '', l.type, l.principal, l.interestRate,
      l.outstandingBalance, l.monthlyInterest, l.ltv ?? '', l.repaidPct,
      l.maturityDate?.slice(0, 10) ?? '',
    ]));
  }
  return lines.join('\n');
}

export async function buildPortfolioCsv(orgOid: mongoose.Types.ObjectId): Promise<string> {
  const properties = await PropertyModel.find({ orgId: orgOid }).lean();
  const propertyIds = properties.map((p: any) => p._id);
  const units = await UnitModel.find({ propertyId: { $in: propertyIds } }).lean();
  const unitsByProperty = new Map<string, any[]>();
  for (const u of units as any[]) {
    const key = u.propertyId.toString();
    if (!unitsByProperty.has(key)) unitsByProperty.set(key, []);
    unitsByProperty.get(key)!.push(u);
  }
  const tenancies = await TenancyModel.find({ unitId: { $in: units.map((u: any) => u._id) }, status: 'ACTIVE' }).lean();
  const occupiedUnitIds = new Set(tenancies.map((t: any) => t.unitId.toString()));

  const lines = [csvRow([
    'PropertyName', 'Status', 'City', 'State', 'Type', 'TotalUnits', 'OccupiedUnits', 'VacantUnits', 'OccupancyRate',
  ])];
  for (const p of properties as any[]) {
    const propUnits = unitsByProperty.get(p._id.toString()) ?? [];
    const occupied = propUnits.filter((u) => occupiedUnitIds.has(u._id.toString())).length;
    const occupancyRate = propUnits.length > 0 ? `${((occupied / propUnits.length) * 100).toFixed(1)}%` : '0.0%';
    lines.push(csvRow([
      p.name ?? '', p.status ?? '', p.address?.city ?? '', p.address?.state ?? '',
      p.type ?? '', propUnits.length, occupied, propUnits.length - occupied, occupancyRate,
    ]));
  }
  return lines.join('\n');
}

async function buildAgreementStatusCsv(userId: mongoose.Types.ObjectId): Promise<string> {
  const { tenants } = await listLandlordTenants(userId, {});
  const tenancyIds = tenants.map((t) => new mongoose.Types.ObjectId(t.tenancyId));
  const participations = await TenantParticipationModel.find({ tenancyId: { $in: tenancyIds } }).lean();
  const byTenancy = new Map(participations.map((p: any) => [p.tenancyId.toString(), p]));

  const agreements = await AgreementModel.find({ tenancyId: { $in: tenancyIds } }, 'tenancyId agreementType status signedAt effectiveDate').lean();
  const agreementsByTenancy = new Map<string, Map<string, any>>();
  for (const a of agreements as any[]) {
    const key = a.tenancyId.toString();
    if (!agreementsByTenancy.has(key)) agreementsByTenancy.set(key, new Map());
    agreementsByTenancy.get(key)!.set(a.agreementType, a);
  }

  const lines = [csvRow([
    'Tenant', 'Email', 'Property', 'Unit', 'ParticipationModel',
    'LeaseStatus', 'LeaseSignedAt', 'LeaseEffectiveDate',
    'RPAStatus', 'RPASignedAt', 'RPAEnrollment',
    'TEPAStatus', 'TEPASignedAt', 'TEPAEnrollment', 'TepaOptIn',
    'LeaseStart', 'LeaseEnd',
  ])];
  for (const t of tenants) {
    const p: any = byTenancy.get(t.tenancyId);
    const a = agreementsByTenancy.get(t.tenancyId);
    const lease = a?.get('LEASE');
    const rpa = a?.get('RPA');
    const tepa = a?.get('TEPA');
    lines.push(csvRow([
      t.name, t.email, t.propertyName, t.unitNumber, t.participationModel,
      lease?.status ?? 'NOT_STARTED', lease?.signedAt?.toISOString?.().slice(0, 10) ?? '', lease?.effectiveDate?.toISOString?.().slice(0, 10) ?? '',
      rpa?.status ?? 'N/A', rpa?.signedAt?.toISOString?.().slice(0, 10) ?? '', p?.rpaEnrollmentStatus ?? 'N/A',
      tepa?.status ?? 'N/A', tepa?.signedAt?.toISOString?.().slice(0, 10) ?? '', p?.tepaEnrollmentStatus ?? 'N/A',
      t.tepaOptInStatus ?? '',
      t.leaseStart?.slice(0, 10) ?? '',
      t.leaseEnd?.slice(0, 10) ?? '',
    ]));
  }
  return lines.join('\n');
}

/**
 * @swagger
 * /api/exports/{dataset}:
 *   get:
 *     summary: Export dataset as CSV
 *     description: >
 *       Streams a CSV file for the requested dataset, scoped to the authenticated landlord's org.
 *       The `:dataset` segment may optionally include a `.csv` suffix (e.g. `properties.csv`).
 *       Valid datasets: `properties`, `tenants`, `financials`, `loans`, `stakeholders`, `tenant-roster`,
 *       `arrears`, `token-ledger`, `rewards-history`, `compliance`, `activity-log`, `agreement-status`.
 *       `tenant-roster` is the full landlord roster (rent, lease dates, months remaining, payment status,
 *       days late, RPA/TEPA status, credits balance). `arrears` is the roster filtered to tenants with arrears.
 *       `token-ledger` = all TEPA token events for the org. `rewards-history` = reward redemptions with
 *       approval/fulfillment status. `compliance` = per-property required-document statuses.
 *       `activity-log` = org activity trail (latest 5000). `agreement-status` = per-tenant RPA/TEPA
 *       enrollment + lease dates.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: dataset
 *         required: true
 *         schema:
 *           type: string
 *           enum: [properties, tenants, financials, loans, stakeholders, tenant-roster, arrears, token-ledger, rewards-history, compliance, activity-log, agreement-status, maintenance, debt, portfolio]
 *         description: Dataset to export (append `.csv` suffix is optional)
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Invalid dataset name
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden – landlord or admin role required
 *       500:
 *         description: Server error
 */
export async function dataExportHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const raw = req.params.dataset as string;
    const dataset = raw.replace(/\.csv$/, '') as Dataset;

    if (!VALID_DATASETS.includes(dataset)) {
      errorResponse(res, 400, 'INVALID_DATASET', `Invalid dataset. Allowed: ${VALID_DATASETS.join(', ')}`);
      return;
    }

    const userId = req.auth?._id as mongoose.Types.ObjectId;

    let csv: string;
    if (dataset === 'tenant-roster' || dataset === 'arrears') {
      csv = await buildRosterCsv(userId, dataset === 'arrears');
    } else if (dataset === 'compliance') {
      csv = await buildComplianceCsv(userId);
    } else if (dataset === 'agreement-status') {
      csv = await buildAgreementStatusCsv(userId);
    } else if (dataset === 'debt') {
      csv = await buildDebtCsv(userId);
    } else {
      const orgId = await resolveLandlordOrgId(userId);
      const orgOid = new mongoose.Types.ObjectId(orgId);
      if (dataset === 'token-ledger') csv = await buildTokenLedgerCsv(orgOid);
      else if (dataset === 'rewards-history') csv = await buildRewardsHistoryCsv(orgOid);
      else if (dataset === 'activity-log') csv = await buildActivityLogCsv(orgOid);
      else if (dataset === 'maintenance') csv = await buildMaintenanceCsv(orgOid);
      else if (dataset === 'portfolio') csv = await buildPortfolioCsv(orgOid);
      else csv = await buildCsv(dataset, orgOid);
    }
    const filename = `${dataset}-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err: any) {
    if (err instanceof AppError) { errorResponse(res, err.statusCode, 'ERROR', err.message); return; }
    console.error('[DATA_EXPORT_ERROR]', err);
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to generate export');
  }
}
