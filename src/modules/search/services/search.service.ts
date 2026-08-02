import mongoose from 'mongoose';
import { UnitModel } from '../../units/models/unit.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { querySearchIndex, getMemberOrgIds } from '../../search-index/services/search-index.service';
import { searchActions } from './action-search.service';
export type { SearchResult, SearchContext } from '../types/search.types';
import type { SearchResult, SearchContext } from '../types/search.types';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function computeConfidence(q: string, name: string): number {
  const n = name.toLowerCase();
  if (n === q) return 0.97;
  if (n.startsWith(q)) return 0.90;
  if (n.split(/\s+/).some((w) => w.startsWith(q))) return 0.85;
  if (n.includes(q)) return 0.78;
  return 0.70;
}


async function searchTenantScope(q: string, regex: RegExp, userId: string): Promise<SearchResult[]> {
  const userOid = new mongoose.Types.ObjectId(userId);
  const tenancy = await TenancyModel.findOne({ tenantUserId: userOid, status: 'ACTIVE' }).lean();
  if (!tenancy) return [];

  const unit = await UnitModel.findById(tenancy.unitId).lean();
  if (!unit) return [];

  const property = await PropertyModel.findById(unit.propertyId).lean();
  const results: SearchResult[] = [];

  if ((unit.normalizedName ?? unit.unitNumber).match(regex)) {
    results.push({
      type: 'unit',
      label: unit.normalizedName ?? `Unit ${unit.unitNumber}`,
      subLabel: property?.name ?? undefined,
      route: '/tenant/unit',
      confidence: computeConfidence(q, unit.normalizedName ?? unit.unitNumber),
    });
  }

  if (property && (property.normalizedName ?? property.name).match(regex)) {
    const loc = property.location || [property.address?.city, property.address?.state].filter(Boolean).join(', ');
    results.push({
      type: 'property',
      label: property.name,
      subLabel: loc || undefined,
      route: '/tenant/property',
      confidence: computeConfidence(q, property.normalizedName ?? property.name),
    });
  }

  return results;
}

export async function runSearch(q: string, ctx: SearchContext): Promise<SearchResult[]> {
  const { userId, orgId, role } = ctx;
  const qLower = q.toLowerCase().trim();
  if (qLower.length < 2) return [];

  let entityResults: SearchResult[];

  if (role === 'tenant') {
    // Tenant scope is small (one unit + one property) — direct query stays fast
    const regex = new RegExp(escapeRegex(qLower), 'i');
    entityResults = await searchTenantScope(qLower, regex, userId);
  } else {
    // All other roles: use the pre-built SearchIndex (single-collection query)
    let memberOrgIds: string[] | undefined;
    if (role === 'investor' || role === 'community_stakeholder') {
      memberOrgIds = await getMemberOrgIds(userId);
    }
    entityResults = await querySearchIndex(qLower, { userId, orgId, role, memberOrgIds });
  }

  const actionResults = searchActions(qLower, role);

  return [...entityResults, ...actionResults]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 20);
}
