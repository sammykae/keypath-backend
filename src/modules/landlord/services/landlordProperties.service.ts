import mongoose from 'mongoose';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { resolveLandlordOrgId } from './landlordDashboard.service';
import { AppError } from '../../../core/errors/AppError';

/** BE-201: List properties with search, status, cursor, limit. Org-scoped. */
export async function listLandlordProperties(
  userId: mongoose.Types.ObjectId,
  query: { search?: string; status?: string; cursor?: string; limit?: number }
) {
  const orgId = await resolveLandlordOrgId(userId);
  const orgOid = new mongoose.Types.ObjectId(orgId);
  const limit = Math.min(25, Math.max(1, query.limit ?? 25));

  const filter: any = { orgId: orgOid };
  if (query.status) {
    filter.status = query.status;
  }
  if (query.search && query.search.trim()) {
    const s = query.search.trim();
    filter.$or = [
      { name: new RegExp(s, 'i') },
      { 'address.line1': new RegExp(s, 'i') },
      { 'address.city': new RegExp(s, 'i') },
    ];
  }

  const sortFilter = query.cursor && mongoose.Types.ObjectId.isValid(query.cursor)
    ? { _id: { $lt: new mongoose.Types.ObjectId(query.cursor) } }
    : {};

  const properties = await PropertyModel.find({ ...filter, ...sortFilter })
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = properties.length > limit;
  const page = hasMore ? properties.slice(0, limit) : properties;
  const nextCursor = hasMore && page.length ? (page[page.length - 1] as any)._id.toString() : null;

  const propertyIds = page.map((p) => (p as any)._id);

  const unitsByProperty = await UnitModel.aggregate([
    { $match: { propertyId: { $in: propertyIds } } },
    { $group: { _id: '$propertyId', count: { $sum: 1 }, unitIds: { $push: '$_id' } } },
  ]);

  const unitIdToPropertyId = new Map<string, string>();
  const allUnitIds: mongoose.Types.ObjectId[] = [];
  for (const u of unitsByProperty) {
    const ids = (u as any).unitIds ?? [];
    for (const uid of ids) {
      unitIdToPropertyId.set(uid.toString(), u._id.toString());
      allUnitIds.push(uid);
    }
  }

  const countMap = new Map(unitsByProperty.map((u) => [u._id.toString(), (u as any).count]));

  let occupiedByProperty: Array<{ _id: mongoose.Types.ObjectId; count: number }> = [];
  if (allUnitIds.length > 0) {
    occupiedByProperty = await TenancyModel.aggregate([
      { $match: { status: 'ACTIVE', unitId: { $in: allUnitIds } } },
      { $group: { _id: '$unitId', count: { $sum: 1 } } },
    ]);
  }

  const occupiedMap = new Map<string, number>();
  for (const o of occupiedByProperty) {
    const propId = unitIdToPropertyId.get(o._id.toString());
    if (propId) {
      occupiedMap.set(propId, (occupiedMap.get(propId) ?? 0) + o.count);
    }
  }

  const list = page.map((p) => {
    const id = (p as any)._id.toString();
    const total = countMap.get(id) ?? 0;
    const occupied = occupiedMap.get(id) ?? 0;
    const addr = (p as any).address ?? {};
    const address = typeof addr === 'object'
      ? [addr.line1, addr.city, addr.state].filter(Boolean).join(', ')
      : '';
    return {
      id,
      orgId: (p as any).orgId?.toString() ?? null,
      name: (p as any).name,
      address,
      city: typeof addr === 'object' ? addr.city ?? '' : '',
      state: typeof addr === 'object' ? addr.state ?? '' : '',
      postalCode: typeof addr === 'object' ? addr.postalCode ?? '' : '',
      type: (p as any).type ?? '',
      unitsCount: total,
      activeTenants: occupied,
      occupancyRate: total > 0 ? Math.round((occupied / total) * 100) : 0,
      status: (p as any).status,
      participationModel: (p as any).participationModel ?? 'RPA_ONLY',
      activationStatus: (p as any).activationStatus ?? 'PENDING',
      onboardingStatus: (p as any).onboardingStatus ?? 'NOT_STARTED',
      imageUrl: (p as any).imageUrl ?? null,
    };
  });

  return { properties: list, nextCursor };
}

/** BE-202: Property detail; 404 if not in org */
export async function getLandlordPropertyDetail(
  userId: mongoose.Types.ObjectId,
  propertyId: string
) {
  const orgId = await resolveLandlordOrgId(userId);
  const orgOid = new mongoose.Types.ObjectId(orgId);

  if (!mongoose.Types.ObjectId.isValid(propertyId)) {
    throw new AppError('Invalid property ID', 400);
  }
  const property = await PropertyModel.findOne({ _id: propertyId, orgId: orgOid }).lean();
  if (!property) {
    throw new AppError('Property not found', 404);
  }

  const units = await UnitModel.find({ propertyId: property._id }).lean();
  const unitIds = units.map((u) => (u as any)._id);

  const activeTenancies = await TenancyModel.find({
    unitId: { $in: unitIds },
    status: 'ACTIVE'
  }).lean();

  const activeTenants = activeTenancies.length;
  const totalUnits = units.length;
  const occupancyRate = totalUnits > 0 ? Math.round((activeTenants / totalUnits) * 100) : 0;
  const monthlyRent = activeTenancies.reduce((sum, t) => sum + (t.rentAmount ?? 0), 0);

  const addr = (property as any).address ?? {};
  const addressStr = typeof addr === 'object'
    ? [addr.line1, addr.city, addr.state, addr.postalCode].filter(Boolean).join(', ')
    : '';

  const activationStatus = (property as any).activationStatus ?? 'PENDING';
  const onboardingStatus = (property as any).onboardingStatus ?? 'NOT_STARTED';
  const riskStatus = (property as any).riskStatus ?? 'LOW';

  const legalAgreementStatus = onboardingStatus === 'COMPLETE' ? 'Complete' : 'Pending';
  const programStatus = activationStatus === 'ACTIVE' ? 'Active'
    : activationStatus === 'SUSPENDED' ? 'Paused'
    : 'Pending';
  const complianceStatus: 'compliant' | 'needs-review' =
    riskStatus === 'HIGH' || riskStatus === 'CRITICAL' ? 'needs-review' : 'compliant';

  return {
    property: {
      id: (property as any)._id.toString(),
      name: (property as any).name,
      address: addressStr,
      city: addr.city ?? '',
      state: addr.state ?? '',
      postalCode: addr.postalCode ?? '',
      status: (property as any).status,
      type: (property as any).type,
      participationModel: (property as any).participationModel ?? 'RPA_ONLY',
      activationStatus,
      onboardingStatus,
      legalAgreementStatus,
      programStatus,
      complianceStatus,
      totalUnits,
      activeTenants,
      occupancyRate,
      monthlyRent,
      estimatedValue: (property as any).valuationUsd ?? (property as any).estimatedPropertyValue ?? 0,
      tokenizedPct: (property as any).tokenizedPct ?? 0,
      imageUrl: (property as any).imageUrl ?? null,
    },
    units: units.map((u) => ({
      id: (u as any)._id.toString(),
      unitNumber: (u as any).unitNumber ?? (u as any).label ?? 'N/A',
      bedrooms: (u as any).bedrooms,
      bathrooms: (u as any).bathrooms,
      rent: (u as any).rent,
      status: (u as any).status,
      squareFootage: (u as any).squareFootage ?? null
    }))
  };
}
