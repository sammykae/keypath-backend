import mongoose from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { User } from '../../auth/models/user.model';
import { MaintenanceTicketModel, MaintenanceStatus, MAINTENANCE_STATUS_LABELS } from '../../maintenance/models/maintenanceTicket.model';
import { S3Storage } from '../../docs/storage';
import { env } from '../../../core/config/env';
import { TenantGoodStandingModel } from '../../good-standing/models/goodStanding.model';
import { PropertyManagerAssignmentModel, PMPermission } from '../models/propertyManagerAssignment.model';

/**
 * Property ids (optionally narrowed to unit ids, for unit-restricted
 * assignments) this PM may act on for `permission`, within one org context.
 * Never consults Membership — assignment + permission is the only source of
 * authorization (Laurel, 2026-07-20). Throws 403 if a specific propertyId
 * was requested but isn't permitted.
 */
async function resolvePMScope(
  propertyManagerUserId: mongoose.Types.ObjectId,
  orgId: string,
  permission: PMPermission,
  propertyId?: string
): Promise<{ propertyIds: mongoose.Types.ObjectId[]; unitIdsByProperty: Map<string, mongoose.Types.ObjectId[] | null> }> {
  if (!mongoose.Types.ObjectId.isValid(orgId)) throw new AppError('Invalid orgId', 400);
  const query: any = {
    propertyManagerUserId,
    orgId: new mongoose.Types.ObjectId(orgId),
    status: 'ACTIVE',
    permissions: permission,
  };
  if (propertyId) {
    if (!mongoose.Types.ObjectId.isValid(propertyId)) throw new AppError('Invalid propertyId', 400);
    query.propertyId = new mongoose.Types.ObjectId(propertyId);
  }

  const assignments = await PropertyManagerAssignmentModel.find(query, 'propertyId unitIds').lean();
  if (propertyId && assignments.length === 0) {
    throw new AppError(`Missing ${permission} permission on this property`, 403);
  }

  const unitIdsByProperty = new Map<string, mongoose.Types.ObjectId[] | null>();
  for (const a of assignments as any[]) {
    unitIdsByProperty.set(a.propertyId.toString(), a.unitIds && a.unitIds.length > 0 ? a.unitIds : null);
  }

  return { propertyIds: assignments.map((a: any) => a.propertyId), unitIdsByProperty };
}

/** Ticket 11: property list, permission-gated, no debt/investor/equity/valuation fields. */
export async function listPropertiesForPM(
  propertyManagerUserId: mongoose.Types.ObjectId,
  orgId: string
) {
  const { propertyIds } = await resolvePMScope(propertyManagerUserId, orgId, 'VIEW_PROPERTY');
  if (propertyIds.length === 0) return { properties: [] };

  const properties = await PropertyModel.find(
    { _id: { $in: propertyIds } },
    'name address type participationModel'
  ).lean();

  const maintenanceScope = await resolvePMScope(propertyManagerUserId, orgId, 'MAINTENANCE_VIEW');
  const maintenancePropIds = maintenanceScope.propertyIds;

  const [units, openMaintenanceCounts] = await Promise.all([
    UnitModel.find({ propertyId: { $in: propertyIds } }, 'propertyId status').lean(),
    maintenancePropIds.length > 0
      ? MaintenanceTicketModel.aggregate([
          { $match: { propertyId: { $in: maintenancePropIds }, status: { $nin: ['RESOLVED', 'REJECTED', 'CLOSED'] } } },
          { $group: { _id: '$propertyId', count: { $sum: 1 } } },
        ])
      : Promise.resolve([]),
  ]);

  const unitsByProperty = new Map<string, any[]>();
  for (const u of units as any[]) {
    const key = u.propertyId.toString();
    if (!unitsByProperty.has(key)) unitsByProperty.set(key, []);
    unitsByProperty.get(key)!.push(u);
  }
  const maintenanceCountByProperty = new Map(
    (openMaintenanceCounts as any[]).map((r) => [r._id.toString(), r.count])
  );
  const maintenancePropIdSet = new Set(maintenancePropIds.map((id) => id.toString()));

  return {
    properties: properties.map((p: any) => {
      const propUnits = unitsByProperty.get(p._id.toString()) ?? [];
      const result: any = {
        id: p._id.toString(),
        name: p.name,
        address: p.address,
        type: p.type,
        unitCount: propUnits.length,
        occupiedUnits: propUnits.filter((u) => u.status === 'OCCUPIED').length,
        vacantUnits: propUnits.filter((u) => u.status === 'VACANT').length,
      };
      if (maintenancePropIdSet.has(p._id.toString())) {
        result.openMaintenanceCount = maintenanceCountByProperty.get(p._id.toString()) ?? 0;
      }
      return result;
    }),
  };
}

/** Ticket 11: unit list, permission-gated (property + optional unit-level restriction). */
export async function listUnitsForPM(
  propertyManagerUserId: mongoose.Types.ObjectId,
  orgId: string,
  propertyId?: string
) {
  const rentScope = await resolvePMScope(propertyManagerUserId, orgId, 'VIEW_RENT_DATA', propertyId).catch(() => ({
    propertyIds: [] as mongoose.Types.ObjectId[],
    unitIdsByProperty: new Map(),
  }));
  const { propertyIds, unitIdsByProperty } = await resolvePMScope(
    propertyManagerUserId,
    orgId,
    'VIEW_UNITS',
    propertyId
  );
  if (propertyIds.length === 0) return { units: [] };
  const canViewRent = new Set(rentScope.propertyIds.map((id) => id.toString()));

  const filter: any = { propertyId: { $in: propertyIds } };
  const units = await UnitModel.find(filter).lean();

  const restrictedUnits = units.filter((u: any) => {
    const restriction = unitIdsByProperty.get(u.propertyId.toString());
    return !restriction || restriction.some((id) => id.toString() === u._id.toString());
  });

  const tenancies = await TenancyModel.find(
    { unitId: { $in: restrictedUnits.map((u: any) => u._id) }, status: 'ACTIVE' }
  ).lean();
  const tenancyByUnit = new Map(tenancies.map((t: any) => [t.unitId.toString(), t]));

  return {
    units: restrictedUnits.map((u: any) => {
      const tenancy = tenancyByUnit.get(u._id.toString());
      const canSeeRent = canViewRent.has(u.propertyId.toString());
      return {
        id: u._id.toString(),
        propertyId: u.propertyId.toString(),
        unitNumber: u.unitNumber,
        status: u.status,
        rent: canSeeRent ? u.rent : undefined,
        leaseStart: tenancy?.leaseStart ?? null,
        leaseEnd: tenancy?.leaseEnd ?? null,
      };
    }),
  };
}

/** Ticket 11: tenant roster, permission-gated. */
export async function listTenantsForPM(
  propertyManagerUserId: mongoose.Types.ObjectId,
  orgId: string,
  propertyId?: string
) {
  const { propertyIds, unitIdsByProperty } = await resolvePMScope(
    propertyManagerUserId,
    orgId,
    'VIEW_TENANTS',
    propertyId
  );
  if (propertyIds.length === 0) return { tenants: [] };

  const units = await UnitModel.find({ propertyId: { $in: propertyIds } }, 'propertyId unitNumber').lean();
  const restrictedUnits = units.filter((u: any) => {
    const restriction = unitIdsByProperty.get(u.propertyId.toString());
    return !restriction || restriction.some((id) => id.toString() === u._id.toString());
  });
  const unitById = new Map(restrictedUnits.map((u: any) => [u._id.toString(), u]));

  const tenancies = await TenancyModel.find(
    { unitId: { $in: restrictedUnits.map((u: any) => u._id) }, status: 'ACTIVE' }
  ).lean();

  const tenantUserIds = tenancies.map((t: any) => t.tenantUserId);
  const [users, goodStandingRows] = await Promise.all([
    User.find({ _id: { $in: tenantUserIds } }, 'email profile.firstName profile.lastName profile.avatarUrl').lean(),
    TenantGoodStandingModel.find({ tenantUserId: { $in: tenantUserIds } }, 'tenantUserId status').lean(),
  ]);
  const userById = new Map(users.map((u: any) => [u._id.toString(), u]));
  const goodStandingByTenant = new Map(goodStandingRows.map((g: any) => [g.tenantUserId.toString(), g.status]));

  return {
    tenants: tenancies.map((t: any) => {
      const unit = unitById.get(t.unitId.toString());
      const user = userById.get(t.tenantUserId.toString());
      const name = user
        ? (`${user.profile?.firstName ?? ''} ${user.profile?.lastName ?? ''}`.trim() || user.email)
        : '';
      return {
        tenantUserId: t.tenantUserId.toString(),
        name,
        email: user?.email ?? '',
        propertyId: unit?.propertyId?.toString() ?? '',
        unitId: t.unitId.toString(),
        unitNumber: unit?.unitNumber ?? '',
        leaseStatus: t.status,
        goodStanding: goodStandingByTenant.get(t.tenantUserId.toString()) ?? null,
      };
    }),
  };
}

/** Ticket 11: lease (tenancy) list, permission-gated; rent/deposit fields only with VIEW_RENT_DATA. */
export async function listLeasesForPM(
  propertyManagerUserId: mongoose.Types.ObjectId,
  orgId: string,
  propertyId?: string
) {
  const { propertyIds, unitIdsByProperty } = await resolvePMScope(
    propertyManagerUserId,
    orgId,
    'VIEW_LEASE_TERMS',
    propertyId
  );
  if (propertyIds.length === 0) return { leases: [] };

  const rentScope = await resolvePMScope(propertyManagerUserId, orgId, 'VIEW_RENT_DATA', propertyId).catch(() => ({
    propertyIds: [] as mongoose.Types.ObjectId[],
  }));
  const canViewRent = new Set(rentScope.propertyIds.map((id) => id.toString()));

  const units = await UnitModel.find({ propertyId: { $in: propertyIds } }, 'propertyId unitNumber').lean();
  const restrictedUnits = units.filter((u: any) => {
    const restriction = unitIdsByProperty.get(u.propertyId.toString());
    return !restriction || restriction.some((id) => id.toString() === u._id.toString());
  });
  const unitById = new Map(restrictedUnits.map((u: any) => [u._id.toString(), u]));

  const tenancies = await TenancyModel.find({ unitId: { $in: restrictedUnits.map((u: any) => u._id) } }).lean();
  const tenantUserIds = tenancies.map((t: any) => t.tenantUserId);
  const users = await User.find({ _id: { $in: tenantUserIds } }, 'email profile.firstName profile.lastName').lean();
  const userById = new Map(users.map((u: any) => [u._id.toString(), u]));

  return {
    leases: tenancies.map((t: any) => {
      const unit = unitById.get(t.unitId.toString());
      const user = userById.get(t.tenantUserId.toString());
      const name = user
        ? (`${user.profile?.firstName ?? ''} ${user.profile?.lastName ?? ''}`.trim() || user.email)
        : '';
      const canSeeRent = unit && canViewRent.has(unit.propertyId.toString());
      return {
        tenancyId: t._id.toString(),
        tenantName: name,
        propertyId: unit?.propertyId?.toString() ?? '',
        unitId: t.unitId.toString(),
        unitNumber: unit?.unitNumber ?? '',
        leaseStart: t.leaseStart,
        leaseEnd: t.leaseEnd,
        status: t.status,
        rentAmount: canSeeRent ? t.rentAmount : undefined,
      };
    }),
  };
}

async function resolveMaintenanceFileUrl(key: string): Promise<string> {
  if (!process.env.AWS_S3_BUCKET) {
    return `${env.BACKEND_URL.replace(/\/$/, '')}/api/docs/files/${key}`;
  }
  const s3 = new S3Storage();
  return s3.getSignedUrl(key, 3600);
}

/**
 * Maintenance ticket list, permission-gated (MAINTENANCE_VIEW). Closes the
 * gap where a PM could update a ticket (SUBMIT_MAINTENANCE_UPDATES) but had
 * no way to discover which tickets exist on their assigned properties.
 */
export async function listMaintenanceForPM(
  propertyManagerUserId: mongoose.Types.ObjectId,
  orgId: string,
  propertyId?: string
) {
  const { propertyIds, unitIdsByProperty } = await resolvePMScope(
    propertyManagerUserId,
    orgId,
    'MAINTENANCE_VIEW',
    propertyId
  );
  if (propertyIds.length === 0) return { tickets: [] };

  const tickets = await MaintenanceTicketModel.find({ propertyId: { $in: propertyIds } })
    .sort({ createdAt: -1 })
    .lean();

  const restrictedTickets = tickets.filter((t: any) => {
    if (!t.unitId) return true;
    const restriction = unitIdsByProperty.get(t.propertyId.toString());
    return !restriction || restriction.some((id) => id.toString() === t.unitId.toString());
  });

  const tenantIds = [...new Set(restrictedTickets.map((t: any) => t.tenantUserId.toString()))];
  const properties = await PropertyModel.find({ _id: { $in: propertyIds } }, 'name').lean();
  const tenants = await User.find(
    { _id: { $in: tenantIds.map((id) => new mongoose.Types.ObjectId(id)) } },
    'email profile.firstName profile.lastName'
  ).lean();
  const propNameById = new Map(properties.map((p: any) => [p._id.toString(), p.name ?? '']));
  const tenantById = new Map(tenants.map((u: any) => [
    u._id.toString(),
    { name: (u as any).profile?.firstName ? `${(u as any).profile.firstName} ${(u as any).profile.lastName ?? ''}`.trim() : (u as any).email, email: (u as any).email },
  ]));

  const allAttachmentKeys = restrictedTickets.flatMap((t: any) => (t.attachments ?? []).map((a: any) => a.fileKey as string));
  const urlCache = new Map<string, string>();
  await Promise.all(allAttachmentKeys.map(async (key) => {
    if (!urlCache.has(key)) urlCache.set(key, await resolveMaintenanceFileUrl(key));
  }));

  return {
    tickets: restrictedTickets.map((t: any) => {
      const tenant = tenantById.get(t.tenantUserId.toString()) ?? { name: 'Unknown', email: '' };
      return {
        id: t._id.toString(),
        tenantName: tenant.name,
        tenantEmail: tenant.email,
        propertyId: t.propertyId.toString(),
        propertyName: propNameById.get(t.propertyId.toString()) ?? '',
        unitId: t.unitId?.toString() ?? null,
        title: t.title,
        description: t.description ?? '',
        issueType: t.issueType ?? 'GENERAL',
        severity: t.severity,
        status: t.status,
        statusLabel: MAINTENANCE_STATUS_LABELS[t.status as MaintenanceStatus] ?? t.status,
        rewardEligible: t.rewardEligible ?? null,
        rewardDecision: t.rewardDecision ?? 'PENDING',
        creditsAwarded: t.creditsAwarded ?? 0,
        attachments: (t.attachments ?? []).map((a: any) => ({
          fileKey: a.fileKey,
          fileName: a.fileName,
          fileType: a.fileType,
          url: urlCache.get(a.fileKey) ?? '',
        })),
        notes: (t.notes ?? []).map((n: any) => ({
          text: n.text,
          authorRole: n.authorRole,
          createdAt: new Date(n.createdAt).toISOString(),
        })),
        resolvedAt: t.resolvedAt ? new Date(t.resolvedAt).toISOString() : null,
        createdAt: new Date(t.createdAt).toISOString(),
      };
    }),
  };
}
