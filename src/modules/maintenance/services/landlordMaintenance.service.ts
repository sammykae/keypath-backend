import mongoose from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import {
  MaintenanceTicketModel,
  MaintenanceStatus,
  MaintenanceIssueType,
  MaintenanceRewardDecision,
  MAINTENANCE_STATUSES,
  MAINTENANCE_STATUS_LABELS,
} from '../models/maintenanceTicket.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { Organization } from '../../orgs/models/organization.model';
import { Membership } from '../../orgs/models/membership.model';
import { User as UserModel } from '../../auth/models/user.model';
import { CreditAccountModel } from '../../ledger/models/creditAccountModel';
import { createCreditEventWithIdempotency } from '../../ledger/services/idempotencyService';
import { CreditEventType } from '../../ledger/types/creditEventTypes';
import { storage, S3Storage } from '../../docs/storage';
import { env } from '../../../core/config/env';
import { ActivityModel } from '../../activities/models/activityModel';
import { notify } from '../../notifications/services/notification.service';
import { AuditEvent } from '../../audit/models/audit-log.model';

export interface LandlordMaintenanceTicketDTO {
  id: string;
  tenantName: string;
  tenantEmail: string;
  propertyName: string;
  propertyImageUrl: string | null;
  unitId: string | null;
  title: string;
  description: string;
  issueType: MaintenanceIssueType;
  severity: string;
  status: MaintenanceStatus;
  statusLabel: string;
  rewardEligible: boolean | null;
  rewardDecision: MaintenanceRewardDecision;
  creditsAwarded: number;
  attachments: { fileKey: string; fileName: string; fileType: string; url: string }[];
  notes: { text: string; authorRole: string; createdAt: string }[];
  resolvedAt: string | null;
  createdAt: string;
}

async function resolveFileUrl(key: string): Promise<string> {
  if (!process.env.AWS_S3_BUCKET) {
    return `${env.BACKEND_URL.replace(/\/$/, '')}/api/docs/files/${key}`;
  }
  const s3 = new S3Storage();
  return s3.getSignedUrl(key, 3600);
}

async function getLandlordOrgId(landlordUserId: string): Promise<mongoose.Types.ObjectId> {
  const membership = await Membership.findOne({
    userId: new mongoose.Types.ObjectId(landlordUserId),
    roleInOrg: { $in: ['OWNER', 'ADMIN'] },
  }).lean();
  if (!membership) throw new AppError('No landlord organization found', 404);
  return (membership as any).orgId;
}

export async function getLandlordMaintenanceTickets(
  landlordUserId: string,
  status?: string
): Promise<LandlordMaintenanceTicketDTO[]> {
  const orgId = await getLandlordOrgId(landlordUserId);

  const properties = await PropertyModel.find({ orgId }).lean();
  if (properties.length === 0) return [];

  const propertyIds = properties.map((p: any) => p._id);
  const propertyMap = new Map(properties.map((p: any) => [p._id.toString(), { name: p.name, imageUrl: p.imageUrl ?? null }]));

  const query: any = { propertyId: { $in: propertyIds } };
  if (status && (MAINTENANCE_STATUSES as string[]).includes(status)) {
    query.status = status;
  }

  const tickets = await MaintenanceTicketModel.find(query).sort({ createdAt: -1 }).lean();

  const tenantIds = [...new Set(tickets.map((t: any) => t.tenantUserId.toString()))];
  const tenants = await UserModel.find({ _id: { $in: tenantIds } }).lean();
  const tenantMap = new Map(tenants.map((u: any) => [
    u._id.toString(),
    { name: (u as any).profile?.firstName ? `${(u as any).profile.firstName} ${(u as any).profile.lastName ?? ''}`.trim() : (u as any).email, email: (u as any).email }
  ]));

  const allAttachmentKeys: string[] = tickets.flatMap((t: any) =>
    (t.attachments ?? []).map((a: any) => a.fileKey as string)
  );
  const urlCache = new Map<string, string>();
  await Promise.all(
    allAttachmentKeys.map(async (key) => {
      if (!urlCache.has(key)) urlCache.set(key, await resolveFileUrl(key));
    })
  );

  return tickets.map((t: any) => {
    const tenant = tenantMap.get(t.tenantUserId.toString()) ?? { name: 'Unknown', email: '' };
    const prop = propertyMap.get(t.propertyId.toString()) ?? { name: 'Unknown', imageUrl: null };
    return {
      id: t._id.toString(),
      tenantName: tenant.name,
      tenantEmail: tenant.email,
      propertyName: prop.name,
      propertyImageUrl: prop.imageUrl,
      unitId: t.unitId?.toString() ?? null,
      title: t.title,
      description: t.description ?? '',
      issueType: t.issueType ?? 'GENERAL',
      severity: t.severity,
      status: t.status,
      statusLabel: MAINTENANCE_STATUS_LABELS[t.status as MaintenanceStatus] ?? t.status,
      rewardEligible: t.rewardEligible ?? null,
      rewardDecision: t.rewardDecision ?? 'PENDING',
      creditsAwarded: t.creditsAwarded ?? 0,
      attachments: (t.attachments ?? []).map((a: any) => ({
        fileKey: a.fileKey,
        fileName: a.fileName,
        fileType: a.fileType,
        url: urlCache.get(a.fileKey) ?? '',
      })),
      notes: mapNotes(t.notes),
      resolvedAt: t.resolvedAt ? new Date(t.resolvedAt).toISOString() : null,
      createdAt: new Date(t.createdAt).toISOString(),
    };
  });
}

function mapNotes(notes: any[] | undefined): { text: string; authorRole: string; createdAt: string }[] {
  return (notes ?? []).map((n: any) => ({
    text: n.text,
    authorRole: n.authorRole,
    createdAt: new Date(n.createdAt).toISOString(),
  }));
}

export async function updateMaintenanceTicket(
  landlordUserId: string,
  ticketId: string,
  data: {
    status?: MaintenanceStatus;
    creditsToAward?: number;
    note?: string;
    rewardEligible?: boolean;
    rewardDecision?: MaintenanceRewardDecision;
    attachments?: { fileKey: string; fileName: string; fileType: string }[];
  }
): Promise<LandlordMaintenanceTicketDTO> {
  const orgId = await getLandlordOrgId(landlordUserId);

  if (!mongoose.Types.ObjectId.isValid(ticketId)) throw new AppError('Invalid ticket ID', 400);

  const ticket = await MaintenanceTicketModel.findOne({
    _id: new mongoose.Types.ObjectId(ticketId),
    orgId,
  });
  if (!ticket) throw new AppError('Ticket not found', 404);

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

  // Award credits to tenant if specified
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
        `maintenance-award-${ticket._id}-${Date.now()}`
      );
      ticket.creditsAwarded = (ticket.creditsAwarded ?? 0) + data.creditsToAward;
      // Awarding credits implies the reward was approved
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
      authorId: new mongoose.Types.ObjectId(landlordUserId),
      authorRole: 'landlord',
      createdAt: new Date(),
    } as any);
  }

  if (data.attachments && data.attachments.length > 0) {
    ticket.attachments.push(...(data.attachments as any));
  }

  await ticket.save();

  ActivityModel.create({
    orgId,
    entity: { type: 'maintenance', id: ticket._id },
    actorId: new mongoose.Types.ObjectId(landlordUserId),
    action: 'MAINTENANCE_UPDATED',
    meta: { status: ticket.status, rewardDecision: ticket.rewardDecision, noteAdded: !!data.note },
    createdAt: new Date(),
  }).catch(() => {});

  if (data.status === 'CLOSED') {
    AuditEvent.create({
      actorUserId: new mongoose.Types.ObjectId(landlordUserId),
      orgId,
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

  if (data.status) {
    notify({
      recipientId: ticket.tenantUserId,
      recipientRole: 'tenant',
      propertyId: ticket.propertyId,
      unitId: ticket.unitId ?? null,
      tenantId: ticket.tenantUserId,
      eventType: 'MAINTENANCE_STATUS_CHANGED',
      eventTitle: 'Maintenance status updated',
      eventDescription: `${ticket.title} is now ${MAINTENANCE_STATUS_LABELS[ticket.status] ?? ticket.status}.`,
    });
  }

  const tenant = await UserModel.findById(ticket.tenantUserId).lean() as any;
  const property = await PropertyModel.findById(ticket.propertyId).lean() as any;

  const resolvedAttachments = await Promise.all(
    (ticket.attachments ?? []).map(async (a: any) => ({
      fileKey: a.fileKey,
      fileName: a.fileName,
      fileType: a.fileType,
      url: await resolveFileUrl(a.fileKey),
    }))
  );

  return {
    id: ticket._id.toString(),
    tenantName: tenant?.profile?.firstName ? `${tenant.profile.firstName} ${tenant.profile.lastName ?? ''}`.trim() : (tenant?.email ?? ''),
    tenantEmail: tenant?.email ?? '',
    propertyName: property?.name ?? 'Unknown',
    propertyImageUrl: property?.imageUrl ?? null,
    unitId: ticket.unitId?.toString() ?? null,
    title: ticket.title,
    description: ticket.description,
    issueType: ticket.issueType ?? 'GENERAL',
    severity: ticket.severity,
    status: ticket.status,
    statusLabel: MAINTENANCE_STATUS_LABELS[ticket.status] ?? ticket.status,
    rewardEligible: ticket.rewardEligible ?? null,
    rewardDecision: ticket.rewardDecision ?? 'PENDING',
    creditsAwarded: ticket.creditsAwarded,
    attachments: resolvedAttachments,
    notes: mapNotes(ticket.notes as any),
    resolvedAt: ticket.resolvedAt ? ticket.resolvedAt.toISOString() : null,
    createdAt: (ticket as any).createdAt.toISOString(),
  };
}

export async function getLandlordEmailForOrg(orgId: mongoose.Types.ObjectId): Promise<string | null> {
  const membership = await Membership.findOne({ orgId, roleInOrg: 'OWNER' }).lean();
  if (!membership) return null;
  const user = await UserModel.findById((membership as any).userId).lean() as any;
  return user?.email ?? null;
}
