import crypto from 'crypto';
import mongoose from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { UnitModel } from '../../units/models/unit.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { TenantInviteModel } from '../../invites/models/tenantInvite.model';
import { User } from '../../auth/models/user.model';
import { AuditEvent } from '../../audit/models/audit-log.model';
import {
  MaintenanceTicketModel,
  MaintenanceStatus,
  MaintenanceRewardDecision,
  MAINTENANCE_STATUS_LABELS,
} from '../../maintenance/models/maintenanceTicket.model';
import { CreditAccountModel } from '../../ledger/models/creditAccountModel';
import { createCreditEventWithIdempotency } from '../../ledger/services/idempotencyService';
import { CreditEventType } from '../../ledger/types/creditEventTypes';
import { ActivityModel } from '../../activities/models/activityModel';
import { PropertyManagerAssignmentModel, PMPermission } from '../models/propertyManagerAssignment.model';
import { notify } from '../../notifications/services/notification.service';

/**
 * Operational actions for a Property Manager — add tenant, update maintenance.
 * The corresponding permission flags (ADD_TENANT, SUBMIT_MAINTENANCE_UPDATES)
 * existed on the assignment model since Sprint B but had no enforcing
 * endpoint; this closes that gap.
 */

async function getAssignmentForProperty(
  propertyManagerUserId: mongoose.Types.ObjectId,
  propertyId: mongoose.Types.ObjectId,
  permission: PMPermission
) {
  const assignment = await PropertyManagerAssignmentModel.findOne({
    propertyManagerUserId,
    propertyId,
    status: 'ACTIVE',
  }).lean();
  if (!assignment) throw new AppError('You are not assigned to this property', 403);
  if (!(assignment as any).permissions.includes(permission)) {
    throw new AppError(`Missing ${permission} permission on this property`, 403);
  }
  return assignment as any;
}

function assertUnitAllowed(assignment: any, unitId: mongoose.Types.ObjectId): void {
  const unitIds = assignment.unitIds as mongoose.Types.ObjectId[] | undefined;
  if (unitIds && unitIds.length > 0 && !unitIds.some((id) => id.toString() === unitId.toString())) {
    throw new AppError('This unit is outside your assignment', 403);
  }
}

export interface AddTenantForPMInput {
  unitId: string;
  email: string;
  rentAmount: number;
  leaseStart: string;
  leaseEnd: string;
}

/**
 * PM adds a tenant to a unit they manage — mirrors the landlord's
 * inviteTenant (creates the tenancy PENDING + a real accept-invite record),
 * scoped through the PM's own assignment instead of resolveLandlordOrgId.
 */
export async function addTenantForPM(
  propertyManagerUserId: mongoose.Types.ObjectId,
  input: AddTenantForPMInput
) {
  if (!mongoose.Types.ObjectId.isValid(input.unitId)) throw new AppError('Invalid unitId', 400);
  const unit = await UnitModel.findById(input.unitId).lean();
  if (!unit) throw new AppError('Unit not found', 404);
  const unitOid = (unit as any)._id;
  const propertyId = (unit as any).propertyId;

  const assignment = await getAssignmentForProperty(propertyManagerUserId, propertyId, 'ADD_TENANT');
  assertUnitAllowed(assignment, unitOid);

  const existing = await TenancyModel.findOne({
    unitId: unitOid,
    status: { $in: ['ACTIVE', 'PENDING'] },
  }).lean();
  if (existing) throw new AppError('Unit already has an active or pending tenant', 409);

  const normalizedEmail = input.email.toLowerCase().trim();
  let tenantUser = await User.findOne({ email: normalizedEmail }).lean();
  let isNewTenantUser = false;
  if (!tenantUser) {
    tenantUser = await User.create({
      email: normalizedEmail,
      role: 'TENANT',
      status: 'ACTIVE',
      profile: { firstName: '', lastName: '' },
    });
    isNewTenantUser = true;
  }
  const tenantUserId = (tenantUser as any)._id;

  const tenancy = await TenancyModel.create({
    tenantUserId,
    unitId: unitOid,
    leaseStart: new Date(input.leaseStart),
    leaseEnd: new Date(input.leaseEnd),
    rentAmount: input.rentAmount,
    status: 'PENDING',
    tepaOptInStatus: 'PENDING',
  });

  const property = await PropertyModel.findById(propertyId).lean();
  const inviteToken = crypto.randomBytes(32).toString('hex');
  await TenantInviteModel.create({
    tenantEmail: normalizedEmail,
    propertyId,
    unitId: unitOid,
    participationModel: 'RPA_ONLY',
    inviteMethod: 'LINK',
    deliveryMethod: 'LANDLORD_SHARED',
    requiredAgreements: ['RPA'],
    inviteToken,
    status: 'SENT',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    leaseStartDate: new Date(input.leaseStart),
    leaseEndDate: new Date(input.leaseEnd),
  });

  const inviteUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/accept-invite?token=${inviteToken}`;

  AuditEvent.create({
    actorUserId: propertyManagerUserId,
    orgId: assignment.orgId,
    action: 'PM_TENANT_ADDED',
    entityType: 'Tenancy',
    entityId: tenancy._id,
    source: 'user',
    updateType: 'manual',
    propertyId,
    metadata: { unitId: unitOid.toString(), email: normalizedEmail },
  }).catch(() => {});

  if (isNewTenantUser) {
    notify({
      recipientId: assignment.landlordUserId ?? propertyManagerUserId,
      recipientRole: assignment.landlordUserId ? 'landlord' : 'property_manager',
      landlordId: assignment.landlordUserId ?? null,
      propertyId,
      unitId: unitOid,
      tenantId: tenantUserId,
      eventType: 'TENANT_REGISTERED',
      eventTitle: 'Tenant registered',
      eventDescription: `${input.email} was registered as a tenant${(property as any)?.name ? ` for ${(property as any).name}` : ''}.`,
    });
  }

  return {
    tenancyId: tenancy._id.toString(),
    tenantUserId: tenantUserId.toString(),
    email: input.email,
    propertyName: (property as any)?.name ?? '',
    inviteUrl,
  };
}

export interface UpdateMaintenanceForPMInput {
  status?: MaintenanceStatus;
  note?: string;
  creditsToAward?: number;
  rewardEligible?: boolean;
  rewardDecision?: MaintenanceRewardDecision;
  attachments?: { fileKey: string; fileName: string; fileType: string }[];
}

const REWARD_FIELDS: (keyof UpdateMaintenanceForPMInput)[] = ['creditsToAward', 'rewardEligible', 'rewardDecision'];

/**
 * PM updates a maintenance ticket's status/notes (SUBMIT_MAINTENANCE_UPDATES).
 * Touching reward-related fields additionally requires MAINTENANCE_AWARD_REWARD
 * — a PM with only the base permission can move a ticket through its
 * workflow but cannot award credits.
 */
export async function updateMaintenanceForPM(
  propertyManagerUserId: mongoose.Types.ObjectId,
  ticketId: string,
  data: UpdateMaintenanceForPMInput
) {
  if (!mongoose.Types.ObjectId.isValid(ticketId)) throw new AppError('Invalid ticket ID', 400);
  const ticket = await MaintenanceTicketModel.findById(ticketId);
  if (!ticket) throw new AppError('Ticket not found', 404);

  const assignment = await getAssignmentForProperty(
    propertyManagerUserId,
    ticket.propertyId,
    'SUBMIT_MAINTENANCE_UPDATES'
  );
  if (ticket.unitId) assertUnitAllowed(assignment, ticket.unitId);

  const touchesReward = REWARD_FIELDS.some((f) => data[f] !== undefined);
  if (touchesReward && !assignment.permissions.includes('MAINTENANCE_AWARD_REWARD')) {
    throw new AppError('Missing MAINTENANCE_AWARD_REWARD permission on this property', 403);
  }

  const previousStatus = ticket.status;

  if (data.status) {
    ticket.status = data.status;
    if (data.status === 'RESOLVED' || data.status === 'CLOSED') {
      ticket.resolvedAt = new Date();
    }
  }

  if (data.rewardEligible !== undefined) {
    ticket.rewardEligible = data.rewardEligible;
    if (data.rewardEligible === false) ticket.rewardDecision = 'DENIED';
  }
  if (data.rewardDecision) {
    ticket.rewardDecision = data.rewardDecision;
  }

  if (data.creditsToAward && data.creditsToAward > 0) {
    const account = await CreditAccountModel.findOne({ tenantUserId: ticket.tenantUserId }).lean();
    if (account) {
      await createCreditEventWithIdempotency(
        {
          accountId: (account as any)._id,
          type: CreditEventType.CREDIT,
          amount: data.creditsToAward,
          occurredAt: new Date(),
          description: data.note ?? `Maintenance resolved: ${ticket.title}`,
          referenceId: ticket._id,
        },
        `pm-maintenance-award-${ticket._id}-${Date.now()}`
      );
      ticket.creditsAwarded = (ticket.creditsAwarded ?? 0) + data.creditsToAward;
      ticket.rewardEligible = ticket.rewardEligible ?? true;
      ticket.rewardDecision = 'APPROVED';
    }
  }

  // Persisted independently of credit-award — previously this text only
  // survived as a ledger description when credits were also awarded, and was
  // silently dropped otherwise.
  if (data.note && data.note.trim().length > 0) {
    ticket.notes.push({
      text: data.note.trim(),
      authorId: propertyManagerUserId,
      authorRole: 'property_manager',
      createdAt: new Date(),
    } as any);
  }

  if (data.attachments && data.attachments.length > 0) {
    ticket.attachments.push(...(data.attachments as any));
  }

  await ticket.save();

  AuditEvent.create({
    actorUserId: propertyManagerUserId,
    orgId: assignment.orgId,
    action: 'PM_MAINTENANCE_UPDATED',
    entityType: 'MaintenanceTicket',
    entityId: ticket._id,
    source: 'user',
    updateType: 'manual',
    propertyId: ticket.propertyId,
    tenantId: ticket.tenantUserId,
    diff: { before: { status: previousStatus }, after: { status: ticket.status, rewardDecision: ticket.rewardDecision } },
  }).catch(() => {});

  if (data.status === 'CLOSED') {
    AuditEvent.create({
      actorUserId: propertyManagerUserId,
      orgId: assignment.orgId,
      action: 'MAINTENANCE_CLOSED',
      entityType: 'MaintenanceTicket',
      entityId: ticket._id,
      source: 'user',
      updateType: 'manual',
      propertyId: ticket.propertyId,
      tenantId: ticket.tenantUserId,
      metadata: { rewardDecision: ticket.rewardDecision, creditsAwarded: ticket.creditsAwarded },
      diff: { before: { status: previousStatus }, after: { status: ticket.status } },
    }).catch(() => {});
  }

  // Also written to the landlord-facing Activity feed (ActivityModel), which
  // a PM-driven update would otherwise never appear in — AuditEvent above is
  // the internal compliance trail, this is what the landlord's Activity tab reads.
  ActivityModel.create({
    orgId: assignment.orgId,
    entity: { type: 'maintenance', id: ticket._id },
    actorId: propertyManagerUserId,
    action: 'MAINTENANCE_UPDATED',
    meta: { status: ticket.status, rewardDecision: ticket.rewardDecision, noteAdded: !!data.note },
    createdAt: new Date(),
  }).catch(() => {});

  return {
    id: ticket._id.toString(),
    status: ticket.status,
    statusLabel: MAINTENANCE_STATUS_LABELS[ticket.status] ?? ticket.status,
    rewardEligible: ticket.rewardEligible ?? null,
    rewardDecision: ticket.rewardDecision ?? 'PENDING',
    creditsAwarded: ticket.creditsAwarded ?? 0,
    attachments: (ticket.attachments ?? []).map((a: any) => ({
      fileKey: a.fileKey,
      fileName: a.fileName,
      fileType: a.fileType,
    })),
    notes: (ticket.notes ?? []).map((n: any) => ({
      text: n.text,
      authorRole: n.authorRole,
      createdAt: n.createdAt.toISOString(),
    })),
    resolvedAt: ticket.resolvedAt ? ticket.resolvedAt.toISOString() : null,
  };
}
