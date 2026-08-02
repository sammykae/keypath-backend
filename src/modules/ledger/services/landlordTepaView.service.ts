import mongoose from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { resolveLandlordOrgId } from '../../landlord/services/landlordDashboard.service';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { getVestingSummary } from './vesting.service';
import { listTokenLedgerEntries } from './tokenLedger.service';

/**
 * Landlord-facing TEPA token-ledger view — a landlord previously had no way
 * to see any tenant's token ledger or vesting breakdown at all (only a PM
 * with TEPA_VIEW could, via propertyManagerTEPA.service.ts). This closes
 * that gap so ledger entries genuinely appear on both dashboards, per the
 * ticket's acceptance criterion.
 */
async function assertTenantInOrg(orgId: string, tenantUserId: string): Promise<mongoose.Types.ObjectId> {
  if (!mongoose.Types.ObjectId.isValid(tenantUserId)) throw new AppError('Invalid tenantUserId', 400);
  const properties = await PropertyModel.find({ orgId: new mongoose.Types.ObjectId(orgId) }, '_id').lean();
  const propertyIds = properties.map((p: any) => p._id);
  const units = await UnitModel.find({ propertyId: { $in: propertyIds } }, '_id propertyId').lean();
  const unitIds = units.map((u: any) => u._id);
  const tenancy = await TenancyModel.findOne({
    tenantUserId: new mongoose.Types.ObjectId(tenantUserId),
    unitId: { $in: unitIds },
    status: 'ACTIVE',
  }).lean();
  if (!tenancy) throw new AppError('Tenant is not on a property in your organization', 403);
  const unit = units.find((u: any) => u._id.toString() === (tenancy as any).unitId.toString());
  return (unit as any).propertyId as mongoose.Types.ObjectId;
}

export async function getTenantTEPASummaryForLandlord(
  landlordUserId: mongoose.Types.ObjectId,
  tenantUserId: string
) {
  const orgId = await resolveLandlordOrgId(landlordUserId);
  await assertTenantInOrg(orgId, tenantUserId);
  const tenantOid = new mongoose.Types.ObjectId(tenantUserId);
  return getVestingSummary(tenantOid);
}

export async function getTenantTokenLedgerForLandlord(
  landlordUserId: mongoose.Types.ObjectId,
  tenantUserId: string,
  propertyId?: string
) {
  const orgId = await resolveLandlordOrgId(landlordUserId);
  const propertyOid = await assertTenantInOrg(orgId, tenantUserId);
  return listTokenLedgerEntries({
    tenantId: tenantUserId,
    propertyId: propertyId ?? propertyOid.toString(),
  });
}
