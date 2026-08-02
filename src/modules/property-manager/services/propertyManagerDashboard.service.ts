import mongoose from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { Organization } from '../../orgs/models/organization.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { MaintenanceTicketModel } from '../../maintenance/models/maintenanceTicket.model';
import { TenantGoodStandingModel } from '../../good-standing/models/goodStanding.model';
import { RedemptionModel } from '../../rewards/models/redemption.model';
import { ConversationModel } from '../../chat/models/conversationModel';
import { MessageModel } from '../../chat/models/messageModel';
import { PropertyManagerAssignmentModel, PMPermission } from '../models/propertyManagerAssignment.model';

/**
 * Ticket 12: distinct landlord (or own, for an independent PM) org contexts
 * this PM has active assignments under. Stateless multi-landlord switching,
 * per Laurel's 2026-07-20 decision — no server-side "active session"; the
 * frontend passes ?orgId= on every dashboard call and persists the last
 * choice client-side.
 */
export async function listLandlordContexts(propertyManagerUserId: mongoose.Types.ObjectId) {
  const rows = await PropertyManagerAssignmentModel.find(
    { propertyManagerUserId, status: 'ACTIVE' },
    'orgId propertyId source'
  ).lean();

  const byOrg = new Map<string, { propertyIds: Set<string>; source: string }>();
  for (const r of rows as any[]) {
    const orgId = r.orgId.toString();
    const entry = byOrg.get(orgId) ?? { propertyIds: new Set<string>(), source: r.source };
    entry.propertyIds.add(r.propertyId.toString());
    if (r.source === 'INDEPENDENT_RPA') entry.source = 'INDEPENDENT_RPA';
    byOrg.set(orgId, entry);
  }

  const orgIds = [...byOrg.keys()];
  const orgs = await Organization.find({ _id: { $in: orgIds } }, 'name').lean();
  const orgNameById = new Map(orgs.map((o: any) => [o._id.toString(), o.name]));

  return {
    landlords: orgIds.map((orgId) => ({
      orgId,
      orgName: orgNameById.get(orgId) ?? '',
      propertyCount: byOrg.get(orgId)!.propertyIds.size,
      source: byOrg.get(orgId)!.source,
    })),
  };
}

async function getActiveAssignmentsForOrg(propertyManagerUserId: mongoose.Types.ObjectId, orgId: string) {
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

/**
 * Ticket 10: dashboard summary cards, scoped to one landlord context and
 * gated per-metric by whichever assigned properties actually grant the
 * relevant permission (assignments are per-property, so a PM can have
 * VIEW_UNITS on Property A but not Property B within the same org).
 */
export async function getDashboardSummary(propertyManagerUserId: mongoose.Types.ObjectId, orgId: string) {
  const assignments = await getActiveAssignmentsForOrg(propertyManagerUserId, orgId);
  const allPropertyIds = assignments.map((a) => a.propertyId);

  const summary: Record<string, number> = {
    assignedProperties: allPropertyIds.length,
  };

  const unitProps = propertiesWithPermission(assignments, 'VIEW_UNITS');
  if (unitProps.length > 0) {
    const units = await UnitModel.find({ propertyId: { $in: unitProps } }, 'status').lean();
    summary.assignedUnits = units.length;
    summary.occupiedUnits = units.filter((u: any) => u.status === 'OCCUPIED').length;
    summary.vacantUnits = units.filter((u: any) => u.status === 'VACANT').length;
  }

  const tenantProps = propertiesWithPermission(assignments, 'VIEW_TENANTS');
  let tenantUnitIds: mongoose.Types.ObjectId[] = [];
  if (tenantProps.length > 0) {
    const units = await UnitModel.find({ propertyId: { $in: tenantProps } }, '_id').lean();
    tenantUnitIds = units.map((u: any) => u._id);
    summary.activeTenants = await TenancyModel.countDocuments({ unitId: { $in: tenantUnitIds }, status: 'ACTIVE' });

    const atRiskTenancies = await TenancyModel.find(
      { unitId: { $in: tenantUnitIds }, status: 'ACTIVE' },
      'tenantUserId'
    ).lean();
    const tenantUserIds = atRiskTenancies.map((t: any) => t.tenantUserId);
    summary.atRiskTenants = await TenantGoodStandingModel.countDocuments({
      tenantUserId: { $in: tenantUserIds },
      status: { $in: ['AT_RISK', 'PAUSED', 'SUSPENDED'] },
    });
  }

  const leaseProps = propertiesWithPermission(assignments, 'VIEW_LEASE_TERMS');
  if (leaseProps.length > 0) {
    const units = await UnitModel.find({ propertyId: { $in: leaseProps } }, '_id').lean();
    const unitIds = units.map((u: any) => u._id);
    const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    summary.leasesExpiringSoon = await TenancyModel.countDocuments({
      unitId: { $in: unitIds },
      status: 'ACTIVE',
      leaseEnd: { $lte: thirtyDaysOut, $gte: new Date() },
    });
  }

  const maintenanceProps = propertiesWithPermission(assignments, 'MAINTENANCE_VIEW');
  if (maintenanceProps.length > 0) {
    summary.openMaintenance = await MaintenanceTicketModel.countDocuments({
      propertyId: { $in: maintenanceProps },
      status: { $nin: ['RESOLVED', 'REJECTED', 'CLOSED'] },
    });
  }

  const rpaProps = propertiesWithPermission(assignments, 'RPA_VIEW');
  if (rpaProps.length > 0) {
    // Proxy for "RPA participants": active tenancies on RPA-enabled properties.
    // No dedicated per-tenant RPA-enrollment flag exists yet in this codebase.
    const properties = await PropertyModel.find(
      { _id: { $in: rpaProps }, participationModel: { $in: ['RPA_ONLY', 'BOTH'] } },
      '_id'
    ).lean();
    const rpaPropIds = properties.map((p: any) => p._id);
    if (rpaPropIds.length > 0) {
      const units = await UnitModel.find({ propertyId: { $in: rpaPropIds } }, '_id').lean();
      const unitIds = units.map((u: any) => u._id);
      const tenancies = await TenancyModel.find({ unitId: { $in: unitIds }, status: 'ACTIVE' }, 'tenantUserId').lean();
      summary.rpaParticipants = tenancies.length;

      const tenantUserIds = tenancies.map((t: any) => t.tenantUserId);
      summary.pendingRewardApprovals = await RedemptionModel.countDocuments({
        tenantUserId: { $in: tenantUserIds },
        approvalStatus: 'PENDING',
      });
    } else {
      summary.rpaParticipants = 0;
      summary.pendingRewardApprovals = 0;
    }
  }

  const tepaProps = propertiesWithPermission(assignments, 'TEPA_VIEW');
  if (tepaProps.length > 0) {
    const units = await UnitModel.find({ propertyId: { $in: tepaProps } }, '_id').lean();
    const unitIds = units.map((u: any) => u._id);
    summary.tepaParticipants = await TenancyModel.countDocuments({
      unitId: { $in: unitIds },
      status: 'ACTIVE',
      tepaOptInStatus: 'OPTED_IN',
    });
  }

  const hasAnyMessagingPermission = assignments.some(
    (a) => a.permissions.includes('MESSAGE_TENANT') || a.permissions.includes('MESSAGE_LANDLORD')
  );
  if (hasAnyMessagingPermission) {
    const conversationIds = (
      await ConversationModel.find(
        { 'participants.userId': propertyManagerUserId, orgId: new mongoose.Types.ObjectId(orgId) },
        '_id'
      ).lean()
    ).map((c: any) => c._id);
    summary.unreadMessages = await MessageModel.countDocuments({
      conversationId: { $in: conversationIds },
      readBy: { $ne: propertyManagerUserId },
      senderUserId: { $ne: propertyManagerUserId },
      deletedAt: null,
    });
  }

  return summary;
}
