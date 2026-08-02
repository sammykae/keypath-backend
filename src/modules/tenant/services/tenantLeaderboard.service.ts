import mongoose from 'mongoose';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { UnitModel } from '../../units/models/unit.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { CreditAccountModel } from '../../ledger/models/creditAccountModel';
import { getBalance } from '../../ledger/services/balanceService';

export interface LeaderboardEntry {
  rank: number;
  displayName: string;   // anonymised: "Abdul W."
  balance: number;
  isCurrentTenant: boolean;
}

export async function getTenantLeaderboard(
  tenantUserId: mongoose.Types.ObjectId
): Promise<{ rows: LeaderboardEntry[]; currentTenantRank: number | null }> {
  // 1. Find tenant's active tenancy → unit → property → org
  const tenancy = await TenancyModel.findOne({
    tenantUserId,
    status: { $in: ['ACTIVE', 'PENDING'] }
  }).lean();

  if (!tenancy) {
    return { rows: [], currentTenantRank: null };
  }

  const unit = await UnitModel.findById(tenancy.unitId).lean();
  if (!unit) return { rows: [], currentTenantRank: null };

  const property = await PropertyModel.findById(unit.propertyId).lean();
  if (!property) return { rows: [], currentTenantRank: null };

  const orgId = (property as any).orgId;

  // 2. Find all units in this org
  const orgProperties = await PropertyModel.find({ orgId }).select('_id').lean();
  const propertyIds = orgProperties.map((p: any) => p._id);
  const orgUnits = await UnitModel.find({ propertyId: { $in: propertyIds } }).select('_id').lean();
  const unitIds = orgUnits.map((u: any) => u._id);

  // 3. Find all active tenants in this org
  const tenancies = await TenancyModel.find({
    unitId: { $in: unitIds },
    status: { $in: ['ACTIVE', 'PENDING'] }
  }).lean();

  if (tenancies.length === 0) return { rows: [], currentTenantRank: null };

  const tenantUserIds = [...new Set(tenancies.map((t: any) => t.tenantUserId.toString()))];

  // 4. Get credit accounts and balances in parallel
  const accounts = await CreditAccountModel.find({
    tenantUserId: { $in: tenantUserIds.map(id => new mongoose.Types.ObjectId(id)) }
  }).lean();

  // Group ALL accounts by tenant (a tenant may have multiple accounts across units/orgs)
  const accountsByTenant = new Map<string, mongoose.Types.ObjectId[]>();
  for (const acc of accounts as any[]) {
    const key = acc.tenantUserId.toString();
    const existing = accountsByTenant.get(key) ?? [];
    existing.push(acc._id);
    accountsByTenant.set(key, existing);
  }

  // Fetch and sum balances across all accounts per tenant (matches getOwnershipCredits logic)
  const balanceEntries = await Promise.all(
    tenantUserIds.map(async (tid) => {
      const accountIds = accountsByTenant.get(tid) ?? [];
      const balances = await Promise.all(accountIds.map((aid) => getBalance(aid)));
      const balance = balances.reduce((sum, b) => sum + b, 0);
      return { tenantUserId: tid, balance };
    })
  );

  // 5. Fetch user names (anonymised)
  const User = mongoose.model('User');
  const users = await User.find({
    _id: { $in: tenantUserIds.map(id => new mongoose.Types.ObjectId(id)) }
  }).select('profile email').lean();

  const nameById = new Map<string, string>();
  for (const u of users as any[]) {
    const firstName = u.profile?.firstName || u.email?.split('@')[0] || 'Tenant';
    const lastName = u.profile?.lastName || '';
    const display = lastName
      ? `${firstName} ${lastName[0].toUpperCase()}.`
      : firstName;
    nameById.set(u._id.toString(), display);
  }

  // 6. Sort by balance desc, assign ranks
  const sorted = balanceEntries
    .sort((a, b) => b.balance - a.balance)
    .map((e, i) => ({
      rank: i + 1,
      displayName: nameById.get(e.tenantUserId) ?? 'Tenant',
      balance: e.balance,
      isCurrentTenant: e.tenantUserId === tenantUserId.toString()
    }));

  const currentTenantRank = sorted.find(r => r.isCurrentTenant)?.rank ?? null;

  // Return top 10
  return { rows: sorted.slice(0, 10), currentTenantRank };
}
