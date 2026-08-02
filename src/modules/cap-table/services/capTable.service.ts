import mongoose from 'mongoose';
import { Membership } from '../../orgs/models/membership.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { TokenLedgerModel } from '../../tokens/models/tokenLedgerModel';
import { User } from '../../auth/models/user.model';
import { CapTableSnapshotModel } from '../models/capTableSnapshot.model';
import type {
  CapTable,
  CapTableAllocation,
  CapTableIssue,
  CapTableRole,
  CapTableTenantBreakdown,
} from '../types/capTable.types';
import { AppError } from '../../../core/errors/AppError';

const EPS = 1e-6;

async function assertCanAccessProperty(
  userId: mongoose.Types.ObjectId,
  propertyOrgId: mongoose.Types.ObjectId
): Promise<void> {
  const user = await User.findById(userId).lean();
  const role = (user as { role?: string } | null)?.role;
  if (role === 'ADMIN') {
    return;
  }
  const m = await Membership.findOne({
    userId,
    orgId: propertyOrgId,
    status: 'active',
  })
    .select('_id')
    .lean();
  if (!m) {
    throw new AppError('Forbidden: no access to this property organization', 403);
  }
}

function roleFromLedgerKey(k: string): CapTableRole {
  if (k === 'tenant') return 'tenant';
  if (k === 'investor') return 'investor';
  return 'landlord';
}

function roundPct(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export interface ComputeCapTableOptions {
  expectedLedgerTotal?: number;
}

export async function computeCapTable(
  propertyId: string,
  userId: mongoose.Types.ObjectId,
  options?: ComputeCapTableOptions
): Promise<CapTable> {
  if (!mongoose.Types.ObjectId.isValid(propertyId)) {
    throw new AppError('Invalid property id', 400);
  }
  const pid = new mongoose.Types.ObjectId(propertyId);
  const property = await PropertyModel.findById(pid).lean();
  if (!property) {
    throw new AppError('Property not found', 404);
  }
  const orgId = property.orgId as mongoose.Types.ObjectId;
  await assertCanAccessProperty(userId, orgId);

  const warnings: CapTableIssue[] = [];
  const errors: CapTableIssue[] = [];

  if (property.valuationUsd == null || Number.isNaN(property.valuationUsd)) {
    warnings.push({
      code: 'VALUATION_NOT_CONFIGURED',
      message: 'Property has no valuationUsd; cap table cannot value economic interest.',
    });
  }

  const facet = await TokenLedgerModel.aggregate([
    { $match: { propertyId: pid } },
    {
      $facet: {
        total: [{ $group: { _id: null, t: { $sum: '$delta' } } }],
        byRole: [
          {
            $addFields: {
              rk: {
                $cond: {
                  if: { $ne: ['$tenantId', null] },
                  then: 'tenant',
                  else: {
                    $switch: {
                      branches: [{ case: { $eq: ['$allocationPool', 'INVESTOR'] }, then: 'investor' }],
                      default: 'landlord',
                    },
                  },
                },
              },
            },
          },
          { $group: { _id: '$rk', tokens: { $sum: '$delta' } } },
        ],
        byTenant: [
          { $match: { tenantId: { $ne: null } } },
          { $group: { _id: '$tenantId', tokens: { $sum: '$delta' } } },
        ],
      },
    },
  ]).exec();

  const row = facet[0] as {
    total: { t: number }[];
    byRole: { _id: string; tokens: number }[];
    byTenant: { _id: mongoose.Types.ObjectId; tokens: number }[];
  };
  const ledgerTotal = row?.total?.[0]?.t ?? 0;
  const roleRows = row?.byRole ?? [];
  const tenantRows = row?.byTenant ?? [];

  const bucket: Record<CapTableRole, number> = {
    landlord: 0,
    tenant: 0,
    investor: 0,
  };
  for (const r of roleRows) {
    const key = roleFromLedgerKey(String(r._id));
    bucket[key] = (bucket[key] ?? 0) + (r.tokens ?? 0);
  }

  const sumBuckets = bucket.landlord + bucket.tenant + bucket.investor;
  const consistency: 'OK' | 'MISMATCH' =
    Math.abs(sumBuckets - ledgerTotal) > EPS ? 'MISMATCH' : 'OK';
  if (consistency === 'MISMATCH') {
    warnings.push({
      code: 'TOKEN_BUCKET_MISMATCH',
      message: `Sum of role buckets (${sumBuckets}) differs from ledger total (${ledgerTotal}).`,
    });
  }

  if (options?.expectedLedgerTotal != null) {
    if (Math.abs(options.expectedLedgerTotal - ledgerTotal) > EPS) {
      warnings.push({
        code: 'TOKEN_MISMATCH',
        message: `expectedLedgerTotal ${options.expectedLedgerTotal} does not match ledger sum ${ledgerTotal}.`,
      });
    }
  }

  const supplyCap =
    property.totalTokenSupply != null && property.totalTokenSupply > 0
      ? property.totalTokenSupply
      : null;

  if (supplyCap != null && ledgerTotal - supplyCap > EPS) {
    errors.push({
      code: 'OVER_ALLOCATION',
      message: `Ledger total ${ledgerTotal} exceeds declared totalTokenSupply ${supplyCap}.`,
    });
  }

  let denom: number;
  if (supplyCap != null) {
    denom = supplyCap;
  } else if (Math.abs(ledgerTotal) < EPS) {
    denom = 1;
  } else {
    denom = ledgerTotal;
  }

  const roles: CapTableRole[] = ['landlord', 'tenant', 'investor'];
  const allocations: CapTableAllocation[] = roles.map((role) => {
    const tokens = bucket[role];
    if (tokens < 0) {
      warnings.push({
        code: `NEGATIVE_POOL_${role.toUpperCase()}`,
        message: `${role} pool has negative balance (${tokens}).`,
      });
    }
    const ownershipPct =
      denom === 0 ? 0 : roundPct((Math.max(0, tokens) / denom) * 100);
    return { role, tokens, ownershipPct };
  });

  const tenant_breakdown: CapTableTenantBreakdown[] = tenantRows.map((t) => {
    const tok = t.tokens ?? 0;
    const ownershipPct = denom === 0 ? 0 : roundPct((Math.max(0, tok) / denom) * 100);
    return { entityId: t._id.toString(), tokens: tok, ownershipPct };
  });

  if (property.tenantPoolFloorTokens != null && property.tenantPoolFloorTokens > 0) {
    if (bucket.tenant + EPS < property.tenantPoolFloorTokens) {
      warnings.push({
        code: 'TENANT_POOL_BELOW_FLOOR',
        message: `Tenant pool ${bucket.tenant} is below configured floor ${property.tenantPoolFloorTokens} (anti-dilution).`,
      });
    }
  }

  const ownership_pct_sum = roundPct(
    allocations.reduce((s, a) => s + a.ownershipPct, 0)
  );

  if (!supplyCap && ownership_pct_sum - 100 > 0.02) {
    warnings.push({
      code: 'OWNERSHIP_PCT_SUM',
      message: `Rounded ownership percentages sum to ${ownership_pct_sum} (expected ~100).`,
    });
  }

  const total_tokens = supplyCap != null ? supplyCap : Math.max(ledgerTotal, 0);

  return {
    property_id: propertyId,
    total_tokens,
    ledger_total_tokens: ledgerTotal,
    allocations,
    tenant_breakdown,
    ownership_pct_sum,
    consistency,
    errors,
    warnings,
  };
}

export async function persistCapTableSnapshot(
  orgId: mongoose.Types.ObjectId,
  table: CapTable
): Promise<void> {
  await CapTableSnapshotModel.findOneAndUpdate(
    { propertyId: new mongoose.Types.ObjectId(table.property_id) },
    {
      $set: {
        orgId,
        propertyId: new mongoose.Types.ObjectId(table.property_id),
        totalTokens: table.total_tokens,
        ledgerTotalTokens: table.ledger_total_tokens,
        allocations: table.allocations,
        tenantBreakdown: table.tenant_breakdown,
        ownershipPctSum: table.ownership_pct_sum,
        consistency: table.consistency,
        tableErrors: table.errors,
        tableWarnings: table.warnings,
        computedAt: new Date(),
      },
    },
    { upsert: true }
  );
}

export async function getLatestSnapshot(propertyId: string): Promise<CapTable | null> {
  if (!mongoose.Types.ObjectId.isValid(propertyId)) return null;
  const doc = await CapTableSnapshotModel.findOne({
    propertyId: new mongoose.Types.ObjectId(propertyId),
  }).lean();
  if (!doc) return null;
  return {
    property_id: doc.propertyId.toString(),
    total_tokens: doc.totalTokens,
    ledger_total_tokens: doc.ledgerTotalTokens,
    allocations: doc.allocations as CapTableAllocation[],
    tenant_breakdown: (doc.tenantBreakdown ?? []) as CapTableTenantBreakdown[],
    ownership_pct_sum: doc.ownershipPctSum,
    consistency: doc.consistency,
    errors: (doc.tableErrors ?? []) as CapTableIssue[],
    warnings: (doc.tableWarnings ?? []) as CapTableIssue[],
    recalculated_at: doc.computedAt?.toISOString(),
  };
}
