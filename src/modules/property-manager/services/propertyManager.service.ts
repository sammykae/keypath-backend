import mongoose from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { User } from '../../auth/models/user.model';
import { Membership } from '../../orgs/models/membership.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { AuditEvent } from '../../audit/models/audit-log.model';
import { resolveLandlordOrgId } from '../../landlord/services/landlordDashboard.service';
import {
  PropertyManagerAssignmentModel,
  PMPermission,
  DEFAULT_PM_PERMISSIONS,
} from '../models/propertyManagerAssignment.model';
import { maybeSendPMActivationInvite } from './propertyManagerInvite.service';

export interface AssignPropertyManagerInput {
  email: string;
  firstName?: string;
  lastName?: string;
  propertyId: string;
  permissions?: PMPermission[];
}

/** Find-or-create a PROPERTY_MANAGER user by email (no self-signup — landlord-provisioned, like tenant invites). */
async function findOrCreatePMUser(email: string, firstName?: string, lastName?: string) {
  const normalized = email.trim().toLowerCase();
  let user = await User.findOne({ email: normalized });
  if (user) {
    if (user.role !== 'PROPERTY_MANAGER' && user.role !== 'ADMIN') {
      throw new AppError(`A user with email ${normalized} already exists with role ${user.role}`, 409);
    }
    return user;
  }
  user = await User.create({
    email: normalized,
    role: 'PROPERTY_MANAGER',
    status: 'PENDING',
    profile: { firstName, lastName },
  });
  return user;
}

/**
 * Assign a property manager to a property. Creates the PM user if needed,
 * ensures an org membership, and creates/reactivates the per-property
 * assignment row. A PM assigned to Property A cannot access Property B
 * unless a separate assignment row exists for it.
 */
export async function assignPropertyManager(
  landlordUserId: mongoose.Types.ObjectId,
  input: AssignPropertyManagerInput
) {
  const orgId = await resolveLandlordOrgId(landlordUserId);
  const orgOid = new mongoose.Types.ObjectId(orgId);

  if (!mongoose.Types.ObjectId.isValid(input.propertyId)) {
    throw new AppError('Invalid propertyId', 400);
  }
  const property = await PropertyModel.findOne({
    _id: new mongoose.Types.ObjectId(input.propertyId),
    orgId: orgOid,
  }).lean();
  if (!property) throw new AppError('Property not found in your organization', 404);

  const pmUser = await findOrCreatePMUser(input.email, input.firstName, input.lastName);

  const existingMembership = await Membership.findOne({ userId: pmUser._id, orgId: orgOid }).lean();
  if (!existingMembership) {
    await Membership.create({ userId: pmUser._id, orgId: orgOid, roleInOrg: 'MEMBER', status: 'active' });
  }

  const existing = await PropertyManagerAssignmentModel.findOne({
    propertyManagerUserId: pmUser._id,
    propertyId: property._id,
  });

  let assignment;
  if (existing) {
    existing.status = 'ACTIVE';
    existing.permissions = input.permissions ?? existing.permissions;
    existing.assignedBy = landlordUserId;
    existing.revokedAt = null;
    existing.revokedBy = null;
    assignment = await existing.save();
  } else {
    assignment = await PropertyManagerAssignmentModel.create({
      orgId: orgOid,
      landlordUserId,
      propertyManagerUserId: pmUser._id,
      propertyId: property._id,
      permissions: input.permissions ?? DEFAULT_PM_PERMISSIONS,
      source: 'LANDLORD_INVITE',
      status: 'ACTIVE',
      assignedBy: landlordUserId,
    });
  }

  // Passwordless activation — a no-op if this PM has already activated on a
  // prior assignment (see maybeSendPMActivationInvite).
  await maybeSendPMActivationInvite({
    propertyManagerUserId: pmUser._id,
    assignmentId: assignment._id,
    orgId: orgOid,
    propertyId: property._id,
    email: pmUser.email,
  }).catch(() => {});

  AuditEvent.create({
    actorUserId: landlordUserId,
    orgId: orgOid,
    action: 'PROPERTY_MANAGER_ASSIGNED',
    entityType: 'propertyManagerAssignment',
    entityId: assignment._id,
    source: 'user',
    updateType: 'manual',
    propertyId: property._id,
    metadata: { propertyManagerUserId: pmUser._id.toString(), permissions: assignment.permissions },
    diff: { before: existing ? { status: 'REVOKED' } : null, after: { status: 'ACTIVE' } },
  }).catch(() => {});

  return {
    id: assignment._id.toString(),
    propertyManagerUserId: pmUser._id.toString(),
    email: pmUser.email,
    propertyId: property._id.toString(),
    propertyName: (property as any).name,
    permissions: assignment.permissions,
    status: assignment.status,
  };
}

/** Landlord view: every PM assignment in the org (optionally filtered by property). */
export async function listPropertyManagerAssignments(
  landlordUserId: mongoose.Types.ObjectId,
  filter: { propertyId?: string } = {}
) {
  const orgId = await resolveLandlordOrgId(landlordUserId);
  const query: any = { orgId: new mongoose.Types.ObjectId(orgId), status: 'ACTIVE' };
  if (filter.propertyId) {
    if (!mongoose.Types.ObjectId.isValid(filter.propertyId)) throw new AppError('Invalid propertyId', 400);
    query.propertyId = new mongoose.Types.ObjectId(filter.propertyId);
  }

  const rows = await PropertyManagerAssignmentModel.find(query).sort({ createdAt: -1 }).lean();
  const pmIds = [...new Set(rows.map((r: any) => r.propertyManagerUserId.toString()))];
  const propIds = [...new Set(rows.map((r: any) => r.propertyId.toString()))];

  const [pmUsers, properties] = await Promise.all([
    User.find({ _id: { $in: pmIds.map((id) => new mongoose.Types.ObjectId(id)) } }, 'email profile.firstName profile.lastName status').lean(),
    PropertyModel.find({ _id: { $in: propIds.map((id) => new mongoose.Types.ObjectId(id)) } }, 'name').lean(),
  ]);
  const pmById = new Map(pmUsers.map((u: any) => [u._id.toString(), u]));
  const propById = new Map(properties.map((p: any) => [p._id.toString(), p]));

  return rows.map((r: any) => {
    const pm = pmById.get(r.propertyManagerUserId.toString());
    return {
      id: r._id.toString(),
      propertyManagerUserId: r.propertyManagerUserId.toString(),
      name: pm ? `${pm.profile?.firstName ?? ''} ${pm.profile?.lastName ?? ''}`.trim() || pm.email : '',
      email: pm?.email ?? '',
      userStatus: pm?.status ?? null,
      propertyId: r.propertyId.toString(),
      propertyName: propById.get(r.propertyId.toString())?.name ?? '',
      permissions: r.permissions,
      status: r.status,
      createdAt: new Date(r.createdAt).toISOString(),
    };
  });
}

/** Revoke a PM's access to a property. Other property assignments are unaffected. */
export async function revokePropertyManager(
  landlordUserId: mongoose.Types.ObjectId,
  assignmentId: string
) {
  if (!mongoose.Types.ObjectId.isValid(assignmentId)) throw new AppError('Invalid assignment id', 400);
  const orgId = await resolveLandlordOrgId(landlordUserId);
  const assignment = await PropertyManagerAssignmentModel.findOne({
    _id: new mongoose.Types.ObjectId(assignmentId),
    orgId: new mongoose.Types.ObjectId(orgId),
    status: 'ACTIVE',
  });
  if (!assignment) throw new AppError('Assignment not found', 404);

  assignment.status = 'REVOKED';
  assignment.revokedAt = new Date();
  assignment.revokedBy = landlordUserId;
  await assignment.save();

  AuditEvent.create({
    actorUserId: landlordUserId,
    orgId: assignment.orgId,
    action: 'PROPERTY_MANAGER_REVOKED',
    entityType: 'propertyManagerAssignment',
    entityId: assignment._id,
    source: 'user',
    updateType: 'manual',
    propertyId: assignment.propertyId,
    diff: { before: { status: 'ACTIVE' }, after: { status: 'REVOKED' } },
  }).catch(() => {});
}

export interface UpdateAssignmentPermissionsInput {
  permissions?: PMPermission[];
  unitIds?: string[] | null;
  allowGroupChat?: boolean;
}

/**
 * Landlord updates one assignment's granular permissions, optional unit-level
 * restriction, and group-chat authorization. Property/assignment-scoped —
 * never touches any other assignment the same PM holds (Laurel, 2026-07-20).
 */
export async function updateAssignmentPermissions(
  landlordUserId: mongoose.Types.ObjectId,
  assignmentId: string,
  input: UpdateAssignmentPermissionsInput
) {
  if (!mongoose.Types.ObjectId.isValid(assignmentId)) throw new AppError('Invalid assignment id', 400);
  const orgId = await resolveLandlordOrgId(landlordUserId);
  const assignment = await PropertyManagerAssignmentModel.findOne({
    _id: new mongoose.Types.ObjectId(assignmentId),
    orgId: new mongoose.Types.ObjectId(orgId),
    status: 'ACTIVE',
  });
  if (!assignment) throw new AppError('Assignment not found', 404);

  const before = {
    permissions: assignment.permissions,
    unitIds: assignment.unitIds,
    allowGroupChat: assignment.allowGroupChat,
  };

  if (input.permissions) assignment.permissions = input.permissions;
  if (input.unitIds !== undefined) {
    assignment.unitIds = input.unitIds
      ? input.unitIds.map((id) => new mongoose.Types.ObjectId(id))
      : undefined;
  }
  if (input.allowGroupChat !== undefined) assignment.allowGroupChat = input.allowGroupChat;

  await assignment.save();

  AuditEvent.create({
    actorUserId: landlordUserId,
    orgId: assignment.orgId,
    action: 'PROPERTY_MANAGER_PERMISSIONS_CHANGED',
    entityType: 'propertyManagerAssignment',
    entityId: assignment._id,
    source: 'user',
    updateType: 'manual',
    propertyId: assignment.propertyId,
    diff: {
      before,
      after: {
        permissions: assignment.permissions,
        unitIds: assignment.unitIds,
        allowGroupChat: assignment.allowGroupChat,
      },
    },
  }).catch(() => {});

  return {
    id: assignment._id.toString(),
    permissions: assignment.permissions,
    unitIds: assignment.unitIds?.map((id) => id.toString()) ?? null,
    allowGroupChat: assignment.allowGroupChat,
  };
}

/** Property ids a PM user currently has active access to. Empty array = no access anywhere. */
export async function getAccessiblePropertyIds(
  propertyManagerUserId: mongoose.Types.ObjectId
): Promise<string[]> {
  const rows = await PropertyManagerAssignmentModel.find(
    { propertyManagerUserId, status: 'ACTIVE' },
    'propertyId'
  ).lean();
  return rows.map((r: any) => r.propertyId.toString());
}

/**
 * True if the PM has active access to the property (and, if given, the unit)
 * with the given permission. Membership/org role is never consulted here —
 * this assignment row is the only source of authorization.
 */
export async function hasPMAccess(
  propertyManagerUserId: mongoose.Types.ObjectId,
  propertyId: string,
  permission?: PMPermission,
  unitId?: string
): Promise<boolean> {
  if (!mongoose.Types.ObjectId.isValid(propertyId)) return false;
  const assignment = await PropertyManagerAssignmentModel.findOne({
    propertyManagerUserId,
    propertyId: new mongoose.Types.ObjectId(propertyId),
    status: 'ACTIVE',
  }).lean();
  if (!assignment) return false;

  const unitIds = (assignment as any).unitIds as mongoose.Types.ObjectId[] | undefined;
  if (unitId && unitIds && unitIds.length > 0) {
    if (!mongoose.Types.ObjectId.isValid(unitId)) return false;
    if (!unitIds.some((u) => u.toString() === unitId)) return false;
  }

  if (!permission) return true;
  return (assignment as any).permissions.includes(permission);
}

/**
 * Enforcing variant of hasPMAccess — throws a 403 instead of returning false.
 * This is the single enforcement point every new Phase 3+ PM-facing endpoint
 * (property/unit/tenant/lease reads, RPA, TEPA, maintenance, reports) should
 * call. Checks, in order: role is property_manager (caller's job — this fn
 * assumes it already holds), an ACTIVE assignment exists for the property,
 * the unit (if given) is within any unit-level restriction, and the flag is
 * granted. Org membership is deliberately never treated as sufficient on its
 * own (Laurel, 2026-07-20).
 */
export async function assertPMPermission(
  propertyManagerUserId: mongoose.Types.ObjectId,
  propertyId: string,
  permission: PMPermission,
  unitId?: string
): Promise<void> {
  const allowed = await hasPMAccess(propertyManagerUserId, propertyId, permission, unitId);
  if (!allowed) {
    throw new AppError(`Missing ${permission} permission on this property`, 403);
  }
}

/**
 * Tenant contacts a PM can message — only tenants on properties the PM is
 * actively assigned to with MESSAGE_TENANT permission (used by the "New Chat"
 * contact list; findOrCreateDirectThread enforces the same rule server-side).
 */
export async function listTenantContactsForPM(propertyManagerUserId: mongoose.Types.ObjectId) {
  const rows = await PropertyManagerAssignmentModel.find({
    propertyManagerUserId,
    status: 'ACTIVE',
    permissions: 'MESSAGE_TENANT',
  }).lean();
  if (rows.length === 0) return [];

  const propIds = rows.map((r: any) => r.propertyId);
  const properties = await PropertyModel.find({ _id: { $in: propIds } }, 'name').lean();
  const propNameById = new Map(properties.map((p: any) => [p._id.toString(), p.name ?? '']));

  const units = await UnitModel.find({ propertyId: { $in: propIds } }, '_id propertyId unitNumber').lean();
  const unitById = new Map(units.map((u: any) => [u._id.toString(), u]));

  const tenancies = await TenancyModel.find({
    unitId: { $in: units.map((u: any) => u._id) },
    status: 'ACTIVE',
  }).lean();

  const tenantIds = [...new Set(tenancies.map((t: any) => t.tenantUserId.toString()))];
  const tenantUsers = await User.find(
    { _id: { $in: tenantIds.map((id) => new mongoose.Types.ObjectId(id)) } },
    'email profile.firstName profile.lastName profile.avatarUrl'
  ).lean();
  const userById = new Map(tenantUsers.map((u: any) => [u._id.toString(), u]));

  return tenancies.map((t: any) => {
    const unit = unitById.get(t.unitId.toString());
    const propertyId = unit?.propertyId?.toString() ?? '';
    const user = userById.get(t.tenantUserId.toString());
    const name = user
      ? (`${user.profile?.firstName ?? ''} ${user.profile?.lastName ?? ''}`.trim() || user.email)
      : '';
    return {
      userId: t.tenantUserId.toString(),
      name,
      email: user?.email ?? '',
      avatarUrl: user?.profile?.avatarUrl ?? null,
      propertyId,
      propertyName: propNameById.get(propertyId) ?? '',
      unitNumber: unit?.unitNumber ?? '',
    };
  });
}

/** For a PM's own dashboard: properties they can access, with assignment/permission info. */
export async function listMyAssignments(propertyManagerUserId: mongoose.Types.ObjectId) {
  const rows = await PropertyManagerAssignmentModel.find({
    propertyManagerUserId,
    status: 'ACTIVE',
  }).lean();
  const propIds = rows.map((r: any) => r.propertyId);
  const properties = await PropertyModel.find({ _id: { $in: propIds } }, 'name address').lean();
  const propById = new Map(properties.map((p: any) => [p._id.toString(), p]));

  return rows.map((r: any) => ({
    assignmentId: r._id.toString(),
    propertyId: r.propertyId.toString(),
    propertyName: propById.get(r.propertyId.toString())?.name ?? '',
    permissions: r.permissions,
  }));
}
