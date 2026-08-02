import mongoose from 'mongoose';
import { User } from '../../auth/models/user.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { UnitModel } from '../../units/models/unit.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { CreditAccountModel } from '../../ledger/models/creditAccountModel';
import { UnitFinancialsModel } from '../../finances/models/unitFinancialsModel';
import { getBalance } from '../../ledger/services/balanceService';
import { resolveLandlordOrgId } from './landlordDashboard.service';
import { AppError } from '../../../core/errors/AppError';
import { TenantGoodStandingModel } from '../../good-standing/models/goodStanding.model';
import { computeStatus } from '../../good-standing/services/goodStanding.service';

const SORTABLE_FIELDS = ['leaseEnd', 'arrearsDays'] as const;
type SortableField = (typeof SORTABLE_FIELDS)[number];

export async function listLandlordTenants(
  userId: mongoose.Types.ObjectId,
  query: {
    propertyId?: string;
    status?: string;
    cursor?: string;
    limit?: number;
    expiringSoon?: boolean;
    hasArrears?: boolean;
    /** "leaseEnd" == lease months remaining (soonest-expiring first when ascending);
     * "arrearsDays" == days late. Both are derived/joined fields, not on Tenancy
     * directly for arrearsDays, so sorting requires materializing a wider page
     * (see below) rather than a DB-level .sort() — nextCursor is always null in
     * this mode as a result (demo-scale roster sizes only; pass-through cursor
     * pagination remains available whenever sortBy is omitted). */
    sortBy?: SortableField;
    sortDir?: 'asc' | 'desc';
  }
) {
  const orgId = await resolveLandlordOrgId(userId);
  const orgOid = new mongoose.Types.ObjectId(orgId);
  const limit = query.limit ? Math.min(200, Math.max(1, query.limit)) : 200;
  const sortBy = query.sortBy && SORTABLE_FIELDS.includes(query.sortBy) ? query.sortBy : null;
  const sortDir = query.sortDir === 'desc' ? -1 : 1;
  const fetchLimit = sortBy ? 500 : limit;

  const properties = await PropertyModel.find({ orgId: orgOid }).lean();
  const propertyIds = properties.map((p) => (p as any)._id);
  let unitIds: mongoose.Types.ObjectId[] = [];
  if (query.propertyId && mongoose.Types.ObjectId.isValid(query.propertyId)) {
    const inOrg = propertyIds.some((id) => id.toString() === query.propertyId);
    if (!inOrg) return { tenants: [], nextCursor: null };
    const units = await UnitModel.find({ propertyId: query.propertyId }).lean();
    unitIds = units.map((u) => (u as any)._id);
  } else {
    const units = await UnitModel.find({ propertyId: { $in: propertyIds } }).lean();
    unitIds = units.map((u) => (u as any)._id);
  }

  if (unitIds.length === 0) return { tenants: [], nextCursor: null };

  const now = new Date();
  const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const filter: any = {
    unitId: { $in: unitIds },
    status: { $nin: ['TERMINATED', 'ENDED'] }
  };
  if (query.status) filter.status = query.status;

  // expiringSoon: lease ending within 90 days
  if (query.expiringSoon) {
    filter.leaseEnd = { $gte: now, $lte: ninetyDaysFromNow };
  }

  const cursorFilter =
    !sortBy && query.cursor && mongoose.Types.ObjectId.isValid(query.cursor)
      ? { _id: { $lt: new mongoose.Types.ObjectId(query.cursor) } }
      : {};

  const tenancies = await TenancyModel.find({ ...filter, ...cursorFilter })
    .sort({ _id: -1 })
    .limit(fetchLimit + (sortBy ? 0 : 1))
    .lean();

  const hasMore = !sortBy && tenancies.length > limit;
  const page = hasMore ? tenancies.slice(0, limit) : tenancies;
  const nextCursor = hasMore && page.length ? (page[page.length - 1] as any)._id.toString() : null;

  const unitIdsPage = page.map((t) => (t as any).unitId);
  const tenantUserIds = page.map((t) => (t as any).tenantUserId);

  const units = await UnitModel.find({ _id: { $in: unitIdsPage } }).lean();
  const unitMap = new Map(units.map((u) => [(u as any)._id.toString(), u]));
  const propertyMap = new Map(properties.map((p) => [(p as any)._id.toString(), p]));

  const users = await User.find({ _id: { $in: tenantUserIds } }).lean();
  const userMap = new Map(users.map((u) => [(u as any)._id.toString(), u]));

  // Credits balance per tenant
  const accountMap = new Map<string, number>();
  for (const t of page) {
    const tenantUserId = (t as any).tenantUserId.toString();
    if (!accountMap.has(tenantUserId)) {
      const accounts = await CreditAccountModel.find({ tenantUserId: (t as any).tenantUserId }).lean();
      let balance = 0;
      for (const a of accounts) balance += await getBalance((a as any)._id);
      accountMap.set(tenantUserId, balance);
    }
  }

  // Latest arrears per unit from UnitFinancials
  const latestFinancials = await UnitFinancialsModel.aggregate([
    { $match: { unitId: { $in: unitIdsPage } } },
    { $sort: { month: -1 } },
    { $group: { _id: '$unitId', arrearsAmount: { $first: '$arrearsAmount' }, arrearsDays: { $first: '$arrearsDays' } } }
  ]);
  const arrearsMap = new Map<string, { arrearsAmount: number; arrearsDays: number }>(
    latestFinancials.map((f: any) => [f._id.toString(), { arrearsAmount: f.arrearsAmount ?? 0, arrearsDays: f.arrearsDays ?? 0 }])
  );

  // Good Standing records (flags + overrides) for this page of tenancies
  const standingRecords = await TenantGoodStandingModel.find({
    tenancyId: { $in: page.map((t) => (t as any)._id) },
  }).lean();
  const standingByTenancy = new Map(standingRecords.map((r: any) => [r.tenancyId.toString(), r]));

  const tenants = page.map((t) => {
    const unit = unitMap.get((t as any).unitId.toString()) as any;
    const propertyId = unit?.propertyId?.toString() ?? '';
    const property = propertyMap.get(propertyId) as any;
    const tenantUserId = (t as any).tenantUserId.toString();
    const tenantUser = userMap.get(tenantUserId) as any;

    const firstName = tenantUser?.profile?.firstName?.trim() || '';
    const lastName = tenantUser?.profile?.lastName?.trim() || '';
    const email = tenantUser?.email?.trim() || '';
    let fullName = '';
    if (firstName || lastName) fullName = `${firstName} ${lastName}`.trim();
    else if (email) fullName = email.split('@')[0];
    else fullName = 'Tenant';

    const tenancyStatus = (t as any).status;
    const leaseEnd: Date | null = (t as any).leaseEnd ? new Date((t as any).leaseEnd) : null;
    const leaseStart: Date | null = (t as any).leaseStart ? new Date((t as any).leaseStart) : null;

    let leaseStatus: 'Active' | 'Renewal Due' | 'At Risk' = 'Active';
    if (tenancyStatus === 'TERMINATED') leaseStatus = 'At Risk';
    else if (tenancyStatus === 'ENDED' || (leaseEnd && leaseEnd <= thirtyDaysFromNow)) leaseStatus = 'Renewal Due';

    const churnRisk: 'Low' | 'Medium' | 'High' =
      leaseStatus === 'At Risk' ? 'High' :
      leaseStatus === 'Renewal Due' ? 'Medium' : 'Low';

    const pm = property?.participationModel ?? 'RPA_ONLY';
    const participationLabel = pm === 'BOTH' ? 'RPA + TEPA' : pm === 'TEPA_ONLY' ? 'TEPA' : 'RPA';

    const arrears = arrearsMap.get((t as any).unitId.toString()) ?? { arrearsAmount: 0, arrearsDays: 0 };

    const standingRecord = standingByTenancy.get((t as any)._id.toString());
    const activeFlagTypes = (standingRecord?.flags ?? [])
      .filter((f: any) => !f.resolvedAt)
      .map((f: any) => f.type);
    const goodStanding = computeStatus({
      arrearsDays: arrears.arrearsDays,
      activeFlagTypes,
      tenancyStatus,
      override: standingRecord?.override ?? null,
    }).status;

    return {
      tenancyId: (t as any)._id.toString(),
      tenantUserId,
      name: fullName,
      email: email || 'N/A',
      profileImage: tenantUser?.profile?.avatarUrl || null,
      unitId: (t as any).unitId.toString(),
      unitNumber: unit?.unitNumber ?? unit?.label ?? 'N/A',
      propertyId,
      propertyName: property?.name ?? 'N/A',
      propertyImageUrl: property?.imageUrl ?? null,
      participationModel: pm,
      participationLabel,
      status: tenancyStatus,
      leaseStatus,
      churnRisk,
      monthlyRent: (t as any).rentAmount ?? 0,
      leaseStart: leaseStart ? leaseStart.toISOString() : null,
      leaseEnd: leaseEnd ? leaseEnd.toISOString() : null,
      tepaOptInStatus: (t as any).tepaOptInStatus ?? null,
      creditsBalance: accountMap.get(tenantUserId) ?? 0,
      arrearsAmount: arrears.arrearsAmount,
      arrearsDays: arrears.arrearsDays,
      goodStanding,
    };
  });

  // hasArrears filter applied after data join (arrears come from separate collection)
  let result = query.hasArrears ? tenants.filter((t) => t.arrearsAmount > 0) : tenants;

  if (sortBy === 'leaseEnd') {
    result = [...result].sort((a, b) => {
      if (a.leaseEnd === null && b.leaseEnd === null) return 0;
      if (a.leaseEnd === null) return 1; // nulls last regardless of direction
      if (b.leaseEnd === null) return -1;
      return sortDir * (new Date(a.leaseEnd).getTime() - new Date(b.leaseEnd).getTime());
    });
  } else if (sortBy === 'arrearsDays') {
    result = [...result].sort((a, b) => sortDir * (a.arrearsDays - b.arrearsDays));
  }

  if (sortBy) result = result.slice(0, limit);

  return { tenants: result, nextCursor };
}
