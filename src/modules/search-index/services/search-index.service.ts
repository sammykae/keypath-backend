// NOTE: This file must NOT import TenantModel, PropertyModel, or UnitModel at the
// top level — those models import this file for their post-save hooks, which would
// create a circular dependency. Access already-registered Mongoose models by name
// (mongoose.model('Property')) when a DB lookup is needed inside an upsert function.
import mongoose, { FilterQuery } from 'mongoose';
import { SearchIndexModel, ISearchIndex } from '../models/search-index.model';
import { SearchContext, SearchResult } from '../../search/types/search.types';
import { Membership } from '../../orgs/models/membership.model';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tokenize(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .trim()
        .split(/[\s\-\/,\.]+/)
        .filter((s) => s.length > 0)
    ),
  ];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function computeConfidence(q: string, doc: ISearchIndex): number {
  const label = doc.label.toLowerCase();
  if (label === q) return 0.97;
  if (label.startsWith(q)) return 0.91;
  const words = label.split(/\s+/);
  if (words.some((w) => w.startsWith(q))) return 0.86;
  if (doc.keywords.some((k) => k.startsWith(q))) return 0.83;
  if (label.includes(q)) return 0.78;
  return 0.72;
}

function toSearchResult(q: string, doc: any): SearchResult {
  return {
    type: doc.type,
    label: doc.label,
    subLabel: doc.subLabel ?? undefined,
    route: doc.route,
    confidence: computeConfidence(q, doc as ISearchIndex),
  };
}

// ---------------------------------------------------------------------------
// Upsert helpers — called from model post-save hooks
// ---------------------------------------------------------------------------

export async function upsertTenantEntry(tenant: any): Promise<void> {
  const keywords = tokenize(tenant.fullName || '');

  await SearchIndexModel.findOneAndUpdate(
    { entityId: tenant._id, type: 'tenant' },
    {
      $set: {
        type: 'tenant',
        entityId: tenant._id,
        label: tenant.fullName,
        keywords,
        route: `/tenants/${tenant._id}`,
        invitedByUserId: tenant.invitedByUserId ?? null,
        propertyId: tenant.propertyId ?? null,
        unitId: tenant.unitId ?? null,
        tenantId: tenant._id,
        roleAccess: ['landlord'],
      },
    },
    { upsert: true, setDefaultsOnInsert: true, new: true }
  );
}

export async function upsertPropertyEntry(property: any): Promise<void> {
  const nameParts = tokenize(property.name || '');
  const city = property.address?.city ?? '';
  const state = property.address?.state ?? '';
  const location = property.location || [city, state].filter(Boolean).join(', ');
  const locationParts = tokenize(location);
  const keywords = [...new Set([...nameParts, ...locationParts])];

  await SearchIndexModel.findOneAndUpdate(
    { entityId: property._id, type: 'property' },
    {
      $set: {
        type: 'property',
        entityId: property._id,
        label: property.name,
        subLabel: location || undefined,
        keywords,
        route: `/properties/${property.slug ?? property._id}`,
        orgId: property.orgId,
        propertyId: property._id,
        roleAccess: ['landlord', 'investor', 'community_stakeholder'],
      },
    },
    { upsert: true, setDefaultsOnInsert: true, new: true }
  );
}

export async function upsertUnitEntry(unit: any): Promise<void> {
  // Use mongoose.model() to avoid importing PropertyModel file (circular dep guard)
  const Property = mongoose.model('Property');
  const property: any = unit.propertyId
    ? await Property.findById(unit.propertyId).select('_id name slug orgId location address').lean()
    : null;

  const numLower = (unit.unitNumber as string || '').toLowerCase().trim();
  const unitTokens = ['unit', numLower, ...numLower.split(/[\s\-\/]+/).filter(Boolean)];
  if (unit.label) unitTokens.push(...tokenize(unit.label));
  const propertyTokens = property ? tokenize(property.name || '') : [];
  const keywords = [...new Set([...unitTokens, ...propertyTokens])];

  const route = property
    ? `/properties/${property.slug ?? property._id}/units/${unit._id}`
    : `/units/${unit._id}`;

  await SearchIndexModel.findOneAndUpdate(
    { entityId: unit._id, type: 'unit' },
    {
      $set: {
        type: 'unit',
        entityId: unit._id,
        label: `Unit ${unit.unitNumber}`,
        subLabel: property?.name ?? undefined,
        keywords,
        route,
        orgId: property?.orgId ?? null,
        propertyId: unit.propertyId ?? null,
        unitId: unit._id,
        tenantId: unit.tenantId ?? null,
        roleAccess: ['landlord'],
      },
    },
    { upsert: true, setDefaultsOnInsert: true, new: true }
  );
}

export async function removeSearchEntry(entityId: string, type: string): Promise<void> {
  await SearchIndexModel.deleteOne({ entityId: new mongoose.Types.ObjectId(entityId), type });
}

// ---------------------------------------------------------------------------
// Query — used by BE-500 search API
// ---------------------------------------------------------------------------

export async function querySearchIndex(
  q: string,
  ctx: SearchContext & { memberOrgIds?: string[] }
): Promise<SearchResult[]> {
  const qLower = q.toLowerCase().trim();
  if (qLower.length < 2) return [];

  // Anchored prefix regex on lowercase keywords: uses the multi-key index
  const regex = new RegExp('^' + escapeRegex(qLower));

  let filter: FilterQuery<ISearchIndex>;

  const { role, userId, orgId, memberOrgIds } = ctx;

  if (role === 'landlord' || role === 'admin') {
    if (!orgId) return [];
    const orgOid = new mongoose.Types.ObjectId(orgId);
    const userOid = new mongoose.Types.ObjectId(userId);
    filter = {
      keywords: regex,
      $or: [
        { orgId: orgOid },
        { invitedByUserId: userOid },
      ],
    };
  } else if (role === 'investor') {
    if (!memberOrgIds?.length) return [];
    filter = {
      keywords: regex,
      orgId: { $in: memberOrgIds.map((id) => new mongoose.Types.ObjectId(id)) },
      roleAccess: 'investor',
    };
  } else if (role === 'community_stakeholder') {
    if (!memberOrgIds?.length) return [];
    filter = {
      keywords: regex,
      orgId: { $in: memberOrgIds.map((id) => new mongoose.Types.ObjectId(id)) },
      roleAccess: 'community_stakeholder',
    };
  } else {
    // tenant role: caller handles directly (tenancy-scoped direct query)
    return [];
  }

  const docs = await SearchIndexModel.find(filter).limit(15).lean();
  return docs.map((d) => toSearchResult(qLower, d));
}

// ---------------------------------------------------------------------------
// Fetch investor/community org IDs — used by BE-500 runSearch
// ---------------------------------------------------------------------------

export async function getMemberOrgIds(userId: string): Promise<string[]> {
  const userOid = new mongoose.Types.ObjectId(userId);
  const memberships = await Membership.find({ userId: userOid, status: 'active' }).lean();
  return memberships.map((m) => String(m.orgId));
}
