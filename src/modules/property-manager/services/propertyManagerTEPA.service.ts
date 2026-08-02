import mongoose from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { User } from '../../auth/models/user.model';
import { getVestingSummary } from '../../ledger/services/vesting.service';
import { listTokenLedgerEntries } from '../../ledger/services/tokenLedger.service';
import { getGoodStanding } from '../../good-standing/services/goodStanding.service';
import { TepaEnrollment } from '../../tepa/models/tepa-enrollment.model';
import { LiquidityRequestModel } from '../../liquidity/models/liquidityRequest.model';
import { PropertyManagerAssignmentModel } from '../models/propertyManagerAssignment.model';
import { getValuationStatus } from '../../properties/services/valuation.service';
import { listAgreementsForOrg } from '../../agreements/services/agreement.service';

/**
 * TEPA monitoring for a Property Manager — strictly read-only (Phase 6).
 * There is no write path here at all, by construction: no function in this
 * file ever mutates vesting, token ledger, enrollment, Good Standing, or
 * liquidity records. All of it re-reads the exact same canonical sources
 * the tenant/landlord views use.
 */

async function getAssignmentForProperty(
  propertyManagerUserId: mongoose.Types.ObjectId,
  propertyId: string,
  permission: 'TEPA_VIEW'
) {
  if (!mongoose.Types.ObjectId.isValid(propertyId)) throw new AppError('Invalid propertyId', 400);
  const assignment = await PropertyManagerAssignmentModel.findOne({
    propertyManagerUserId,
    propertyId: new mongoose.Types.ObjectId(propertyId),
    status: 'ACTIVE',
  }).lean();
  if (!assignment) throw new AppError('You are not assigned to this property', 403);
  if (!(assignment as any).permissions.includes(permission)) {
    throw new AppError('Missing TEPA_VIEW permission on this property', 403);
  }
  return assignment as any;
}

async function assertTenantOnProperty(tenantUserId: string, propertyId: mongoose.Types.ObjectId) {
  if (!mongoose.Types.ObjectId.isValid(tenantUserId)) throw new AppError('Invalid tenantUserId', 400);
  const units = await UnitModel.find({ propertyId }, '_id').lean();
  const unitIds = units.map((u: any) => u._id);
  const tenancy = await TenancyModel.findOne({
    tenantUserId: new mongoose.Types.ObjectId(tenantUserId),
    unitId: { $in: unitIds },
    status: 'ACTIVE',
  }).lean();
  if (!tenancy) throw new AppError('Tenant is not on a unit you manage on this property', 403);
  return tenancy as any;
}

/**
 * Per-tenant TEPA summary: vesting, Good Standing, TEPA opt-in status, and
 * the consent/agreement record — read-only, no mutation controls returned
 * or possible via this module.
 */
export async function getTenantTEPASummaryForPM(
  propertyManagerUserId: mongoose.Types.ObjectId,
  propertyId: string,
  tenantUserId: string
) {
  const assignment = await getAssignmentForProperty(propertyManagerUserId, propertyId, 'TEPA_VIEW');
  const tenancy = await assertTenantOnProperty(tenantUserId, assignment.propertyId);

  const tenantOid = new mongoose.Types.ObjectId(tenantUserId);
  const [vesting, goodStanding, agreement] = await Promise.all([
    getVestingSummary(tenantOid).catch(() => null),
    getGoodStanding(tenantOid),
    TepaEnrollment.findOne({ tenantUserId: tenantOid, unitId: tenancy.unitId })
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  return {
    tenantUserId,
    tepaParticipation: tenancy.tepaOptInStatus ?? 'PENDING',
    agreement: agreement
      ? {
          status: (agreement as any).status,
          consentVersion: (agreement as any).consentVersion,
          acceptedAt: (agreement as any).acceptedAt?.toISOString() ?? null,
          effectiveDate: (agreement as any).effectiveDate?.toISOString() ?? null,
        }
      : null,
    vesting,
    goodStanding,
  };
}

/** Token ledger entries for one tenant on one property — read-only activity history. */
export async function getTenantTokenLedgerForPM(
  propertyManagerUserId: mongoose.Types.ObjectId,
  propertyId: string,
  tenantUserId: string
) {
  const assignment = await getAssignmentForProperty(propertyManagerUserId, propertyId, 'TEPA_VIEW');
  await assertTenantOnProperty(tenantUserId, assignment.propertyId);
  return listTokenLedgerEntries({ tenantId: tenantUserId, propertyId });
}

/** Property-level TEPA participation rollup: which tenants are opted in on this property. */
export async function getPropertyTEPASummaryForPM(
  propertyManagerUserId: mongoose.Types.ObjectId,
  propertyId: string
) {
  const assignment = await getAssignmentForProperty(propertyManagerUserId, propertyId, 'TEPA_VIEW');

  const units = await UnitModel.find({ propertyId: assignment.propertyId }, '_id unitNumber').lean();
  const unitById = new Map(units.map((u: any) => [u._id.toString(), u]));
  const tenancies = await TenancyModel.find(
    { unitId: { $in: units.map((u: any) => u._id) }, status: 'ACTIVE', tepaOptInStatus: 'OPTED_IN' },
    'tenantUserId unitId'
  ).lean();

  const tenantIds = tenancies.map((t: any) => t.tenantUserId);
  const users = await User.find({ _id: { $in: tenantIds } }, 'email profile.firstName profile.lastName').lean();
  const userById = new Map(users.map((u: any) => [u._id.toString(), u]));

  return {
    propertyId,
    participantCount: tenancies.length,
    participants: tenancies.map((t: any) => {
      const user = userById.get(t.tenantUserId.toString());
      const unit = unitById.get(t.unitId.toString());
      const name = user ? (`${user.profile?.firstName ?? ''} ${user.profile?.lastName ?? ''}`.trim() || user.email) : '';
      return {
        tenantUserId: t.tenantUserId.toString(),
        name,
        unitNumber: unit?.unitNumber ?? '',
      };
    }),
  };
}

/** Annual valuation history + status for a property this PM has TEPA_VIEW on — read-only. */
export async function getPropertyValuationForPM(
  propertyManagerUserId: mongoose.Types.ObjectId,
  propertyId: string
) {
  const assignment = await getAssignmentForProperty(propertyManagerUserId, propertyId, 'TEPA_VIEW');
  return getValuationStatus(assignment.propertyId.toString());
}

/** Read-only agreement status for one property this PM has TEPA_VIEW on — which tenants have signed RPA/TEPA/Lease. */
export async function listAgreementsForPM(
  propertyManagerUserId: mongoose.Types.ObjectId,
  propertyId: string
) {
  const assignment = await getAssignmentForProperty(propertyManagerUserId, propertyId, 'TEPA_VIEW');
  return listAgreementsForOrg(assignment.orgId.toString(), { propertyId: assignment.propertyId.toString() });
}

/** Read-only liquidity request list for tenants on properties this PM has TEPA_VIEW on. No review/deduct/ROFR/transfer actions exist here. */
export async function listLiquidityRequestsForPM(
  propertyManagerUserId: mongoose.Types.ObjectId,
  propertyId: string
) {
  const assignment = await getAssignmentForProperty(propertyManagerUserId, propertyId, 'TEPA_VIEW');

  const requests = await LiquidityRequestModel.find({ propertyId: assignment.propertyId })
    .sort({ createdAt: -1 })
    .lean();

  return {
    requests: (requests as any[]).map((r) => ({
      id: r._id.toString(),
      tenantUserId: r.tenantUserId.toString(),
      requestedTokens: r.requestedTokens,
      vestedTokensAtRequest: r.vestedTokensAtRequest,
      status: r.status,
      rofrDecision: r.rofrDecision,
      transferStatus: r.transferStatus,
      submittedAt: r.submittedAt?.toISOString?.() ?? null,
    })),
  };
}
