import mongoose from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { User } from '../../auth/models/user.model';
import { TenantGoodStandingModel } from '../../good-standing/models/goodStanding.model';
import { MaintenanceTicketModel, MAINTENANCE_STATUS_LABELS } from '../../maintenance/models/maintenanceTicket.model';
import { RedemptionModel } from '../../rewards/models/redemption.model';
import { RewardCatalogModel } from '../../tenant/models/rewardCatalog.model';
import { TokenLedgerEntryModel } from '../../ledger/models/tokenLedgerEntry.model';
import { AuditEvent } from '../../audit/models/audit-log.model';
import { PropertyManagerAssignmentModel, PMPermission } from '../models/propertyManagerAssignment.model';

/**
 * CSV exports for a Property Manager — Reports & Exports. Property-scoped
 * (never org-wide like the landlord's /api/exports/:dataset), reusing the
 * assignment + permission gating pattern from the rest of this module.
 */

export const PM_EXPORT_DATASETS = [
  'tenant-roster', 'arrears', 'lease-expiration', 'maintenance',
  'rewards-history', 'token-ledger', 'activity-log',
] as const;
export type PMExportDataset = typeof PM_EXPORT_DATASETS[number];

function cell(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function csvRow(cells: unknown[]): string {
  return cells.map(cell).join(',');
}

async function getActiveAssignments(propertyManagerUserId: mongoose.Types.ObjectId, orgId: string) {
  if (!mongoose.Types.ObjectId.isValid(orgId)) throw new AppError('Invalid orgId', 400);
  const rows = await PropertyManagerAssignmentModel.find({
    propertyManagerUserId,
    orgId: new mongoose.Types.ObjectId(orgId),
    status: 'ACTIVE',
  }).lean();
  if (rows.length === 0) throw new AppError('No active assignment in this organization', 403);
  return rows as any[];
}

function propertiesWithPermission(assignments: any[], permission: PMPermission): mongoose.Types.ObjectId[] {
  return assignments.filter((a) => a.permissions.includes(permission)).map((a) => a.propertyId);
}

async function nameOf(userById: Map<string, any>, userId: string): Promise<string> {
  const u = userById.get(userId);
  if (!u) return '';
  const n = `${u.profile?.firstName ?? ''} ${u.profile?.lastName ?? ''}`.trim();
  return n || u.email || '';
}

interface PMTenantContext {
  propIds: mongoose.Types.ObjectId[];
  propNameById: Map<string, string>;
  unitById: Map<string, any>;
  tenancies: any[];
  tenantIds: string[];
  userById: Map<string, any>;
}

async function buildPMTenantContext(propIds: mongoose.Types.ObjectId[]): Promise<PMTenantContext> {
  const properties = await PropertyModel.find({ _id: { $in: propIds } }, '_id name').lean();
  const propNameById = new Map(properties.map((p: any) => [p._id.toString(), p.name ?? '']));
  const units = await UnitModel.find({ propertyId: { $in: propIds } }, '_id propertyId unitNumber').lean();
  const unitById = new Map(units.map((u: any) => [u._id.toString(), u]));
  const tenancies = await TenancyModel.find({ unitId: { $in: units.map((u: any) => u._id) } }).lean();
  const tenantIds = [...new Set(tenancies.map((t: any) => t.tenantUserId.toString()))];
  const users = await User.find(
    { _id: { $in: tenantIds.map((id) => new mongoose.Types.ObjectId(id)) } },
    'email profile.firstName profile.lastName'
  ).lean();
  const userById = new Map(users.map((u: any) => [u._id.toString(), u]));
  return { propIds, propNameById, unitById, tenancies, tenantIds, userById };
}

async function buildRosterCsv(propIds: mongoose.Types.ObjectId[], onlyArrears: boolean): Promise<string> {
  const ctx = await buildPMTenantContext(propIds);
  const activeTenancies = ctx.tenancies.filter((t: any) => t.status === 'ACTIVE');
  const goodStandingRows = await TenantGoodStandingModel.find(
    { tenantUserId: { $in: activeTenancies.map((t: any) => t.tenantUserId) } },
    'tenantUserId status arrearsDays'
  ).lean();
  const gsByTenant = new Map(goodStandingRows.map((g: any) => [g.tenantUserId.toString(), g]));

  const lines: string[] = [];
  const header = onlyArrears
    ? ['TenantName', 'Email', 'Property', 'Unit', 'MonthlyRent', 'ArrearsDays', 'GoodStanding', 'LeaseEnd']
    : ['TenantName', 'Email', 'Property', 'Unit', 'MonthlyRent', 'LeaseStart', 'LeaseEnd', 'Status', 'GoodStanding', 'ArrearsDays'];
  lines.push(csvRow(header));

  for (const t of activeTenancies) {
    const gs: any = gsByTenant.get(t.tenantUserId.toString());
    const arrearsDays = gs?.arrearsDays ?? 0;
    if (onlyArrears && arrearsDays <= 0) continue;

    const unit: any = ctx.unitById.get(t.unitId.toString());
    const name = await nameOf(ctx.userById, t.tenantUserId.toString());
    const user: any = ctx.userById.get(t.tenantUserId.toString());
    const propertyName = unit ? ctx.propNameById.get(unit.propertyId.toString()) ?? '' : '';

    if (onlyArrears) {
      lines.push(csvRow([
        name, user?.email ?? '', propertyName, unit?.unitNumber ?? '', t.rentAmount,
        arrearsDays, gs?.status ?? '', t.leaseEnd?.toISOString?.().slice(0, 10) ?? '',
      ]));
    } else {
      lines.push(csvRow([
        name, user?.email ?? '', propertyName, unit?.unitNumber ?? '', t.rentAmount,
        t.leaseStart?.toISOString?.().slice(0, 10) ?? '', t.leaseEnd?.toISOString?.().slice(0, 10) ?? '',
        t.status, gs?.status ?? '', arrearsDays,
      ]));
    }
  }
  return lines.join('\n');
}

async function buildLeaseExpirationCsv(propIds: mongoose.Types.ObjectId[]): Promise<string> {
  const ctx = await buildPMTenantContext(propIds);
  const lines = [csvRow(['TenantName', 'Property', 'Unit', 'LeaseStart', 'LeaseEnd', 'Status'])];
  for (const t of ctx.tenancies.filter((t: any) => t.status === 'ACTIVE') as any[]) {
    const unit: any = ctx.unitById.get(t.unitId.toString());
    const name = await nameOf(ctx.userById, t.tenantUserId.toString());
    const propertyName = unit ? ctx.propNameById.get(unit.propertyId.toString()) ?? '' : '';
    lines.push(csvRow([
      name, propertyName, unit?.unitNumber ?? '',
      t.leaseStart?.toISOString?.().slice(0, 10) ?? '', t.leaseEnd?.toISOString?.().slice(0, 10) ?? '', t.status,
    ]));
  }
  return lines.join('\n');
}

async function buildMaintenanceCsv(propIds: mongoose.Types.ObjectId[]): Promise<string> {
  const ctx = await buildPMTenantContext(propIds);
  const tickets = await MaintenanceTicketModel.find({ propertyId: { $in: propIds } }).sort({ createdAt: -1 }).lean();
  const lines = [csvRow(['Date', 'Tenant', 'Property', 'Title', 'IssueType', 'Severity', 'Status', 'RewardEligible', 'RewardDecision', 'CreditsAwarded', 'ResolvedAt'])];
  for (const t of tickets as any[]) {
    const name = await nameOf(ctx.userById, t.tenantUserId.toString());
    lines.push(csvRow([
      t.createdAt?.toISOString?.() ?? '', name, ctx.propNameById.get(t.propertyId.toString()) ?? '',
      t.title ?? '', t.issueType ?? 'GENERAL', t.severity ?? '',
      MAINTENANCE_STATUS_LABELS[t.status as keyof typeof MAINTENANCE_STATUS_LABELS] ?? t.status ?? '',
      t.rewardEligible == null ? '' : t.rewardEligible ? 'Yes' : 'No',
      t.rewardDecision ?? '', t.creditsAwarded ?? 0, t.resolvedAt?.toISOString?.() ?? '',
    ]));
  }
  return lines.join('\n');
}

async function buildRewardsHistoryCsv(propIds: mongoose.Types.ObjectId[]): Promise<string> {
  const ctx = await buildPMTenantContext(propIds);
  const redemptions = await RedemptionModel.find({
    tenantUserId: { $in: ctx.tenantIds.map((id) => new mongoose.Types.ObjectId(id)) },
  }).sort({ createdAt: -1 }).lean();

  // Correctly resolved against RewardCatalogModel (the redemption flow's
  // actual reward source — the landlord export's equivalent builder looks
  // up the wrong "Reward" model and silently gets blank titles; not
  // replicating that here).
  const rewardIds = [...new Set(redemptions.map((r: any) => r.rewardId.toString()))];
  const rewards = await RewardCatalogModel.find(
    { _id: { $in: rewardIds.map((id) => new mongoose.Types.ObjectId(id)) } },
    'title'
  ).lean();
  const rewardTitleById = new Map(rewards.map((r: any) => [r._id.toString(), r.title ?? '']));

  const lines = [csvRow(['Date', 'Tenant', 'Reward', 'Credits', 'ApprovalStatus', 'FulfillmentType', 'FulfillmentStatus'])];
  for (const r of redemptions as any[]) {
    const name = await nameOf(ctx.userById, r.tenantUserId.toString());
    lines.push(csvRow([
      r.createdAt?.toISOString?.() ?? '', name, rewardTitleById.get(r.rewardId.toString()) ?? '',
      r.amount, r.approvalStatus ?? '', r.fulfillment?.type ?? '', r.fulfillment?.status ?? '',
    ]));
  }
  return lines.join('\n');
}

async function buildTokenLedgerCsv(propIds: mongoose.Types.ObjectId[]): Promise<string> {
  const ctx = await buildPMTenantContext(propIds);
  const entries = await TokenLedgerEntryModel.find({ propertyId: { $in: propIds } }).sort({ timestamp: -1 }).lean();
  const lines = [csvRow(['Date', 'Tenant', 'Property', 'Type', 'Tokens', 'Value', 'Source'])];
  for (const e of entries as any[]) {
    const name = await nameOf(ctx.userById, e.tenantId.toString());
    lines.push(csvRow([
      e.timestamp?.toISOString?.() ?? '', name, ctx.propNameById.get(e.propertyId.toString()) ?? '',
      e.type, e.tokens, e.value ?? '', e.source ?? '',
    ]));
  }
  return lines.join('\n');
}

async function buildActivityLogCsv(orgId: string, propIds: mongoose.Types.ObjectId[]): Promise<string> {
  const propIdSet = new Set(propIds.map((id) => id.toString()));
  const events = await AuditEvent.find({ orgId: new mongoose.Types.ObjectId(orgId) })
    .sort({ createdAt: -1 })
    .limit(5000)
    .lean();
  const scoped = (events as any[]).filter((e) => !e.propertyId || propIdSet.has(e.propertyId.toString()));

  const actorIds = [...new Set(scoped.map((e) => e.actorUserId?.toString()).filter(Boolean))];
  const actors = await User.find(
    { _id: { $in: actorIds.map((id) => new mongoose.Types.ObjectId(id)) } },
    'email profile.firstName profile.lastName'
  ).lean();
  const actorById = new Map(actors.map((u: any) => [u._id.toString(), u]));

  const lines = [csvRow(['Date', 'Action', 'EntityType', 'EntityId', 'Actor'])];
  for (const e of scoped) {
    const actor: any = actorById.get(e.actorUserId?.toString() ?? '');
    const actorName = actor ? (`${actor.profile?.firstName ?? ''} ${actor.profile?.lastName ?? ''}`.trim() || actor.email) : '';
    lines.push(csvRow([
      e.createdAt?.toISOString?.() ?? '', e.action ?? '', e.entityType ?? '', e.entityId?.toString() ?? '', actorName,
    ]));
  }
  return lines.join('\n');
}

/** Main entry point: property-scoped CSV export, gated by EXPORT_REPORTS (or TEPA_VIEW for token-ledger). */
export async function exportDatasetForPM(
  propertyManagerUserId: mongoose.Types.ObjectId,
  orgId: string,
  dataset: PMExportDataset,
  propertyId?: string
): Promise<string> {
  const assignments = await getActiveAssignments(propertyManagerUserId, orgId);

  const requiredPermission: PMPermission = dataset === 'token-ledger' ? 'TEPA_VIEW' : 'EXPORT_REPORTS';
  let propIds = propertiesWithPermission(assignments, requiredPermission);
  if (propertyId) {
    if (!propIds.some((id) => id.toString() === propertyId)) {
      throw new AppError(`Missing ${requiredPermission} permission on this property`, 403);
    }
    propIds = [new mongoose.Types.ObjectId(propertyId)];
  }
  if (propIds.length === 0) return csvRow(['No data — missing required permission']);

  switch (dataset) {
    case 'tenant-roster': return buildRosterCsv(propIds, false);
    case 'arrears': return buildRosterCsv(propIds, true);
    case 'lease-expiration': return buildLeaseExpirationCsv(propIds);
    case 'maintenance': return buildMaintenanceCsv(propIds);
    case 'rewards-history': return buildRewardsHistoryCsv(propIds);
    case 'token-ledger': return buildTokenLedgerCsv(propIds);
    case 'activity-log': return buildActivityLogCsv(orgId, propIds);
  }
}
