import mongoose from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import {
  MaintenanceTicketModel,
  MaintenanceSeverity,
  MaintenanceIssueType,
  MAINTENANCE_STATUS_LABELS,
  MaintenanceStatus,
} from '../models/maintenanceTicket.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { UnitModel } from '../../units/models/unit.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { User as UserModel } from '../../auth/models/user.model';
import { Membership } from '../../orgs/models/membership.model';
import { sendTransactionalEmail, isEmailConfigured } from '../../../core/email/sendTransactionalEmail';
import { S3Storage } from '../../docs/storage';
import { env } from '../../../core/config/env';
import { ActivityModel } from '../../activities/models/activityModel';
import { notify } from '../../notifications/services/notification.service';

export interface MaintenanceTicketDTO {
  id: string;
  title: string;
  description: string;
  issueType: MaintenanceIssueType;
  severity: MaintenanceSeverity;
  status: string;
  statusLabel: string;
  rewardEligible: boolean | null;
  rewardDecision: string;
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

export async function getTenantMaintenanceTickets(tenantUserId: string, tenancyId?: string): Promise<MaintenanceTicketDTO[]> {
  const query: any = { tenantUserId: new mongoose.Types.ObjectId(tenantUserId) };

  if (tenancyId && mongoose.Types.ObjectId.isValid(tenancyId)) {
    const tenancy = await TenancyModel.findOne({
      _id: new mongoose.Types.ObjectId(tenancyId),
      tenantUserId: new mongoose.Types.ObjectId(tenantUserId),
    }).lean();
    if (tenancy) query.unitId = tenancy.unitId;
  }

  const tickets = await MaintenanceTicketModel.find(query)
    .sort({ createdAt: -1 })
    .lean();

  const allKeys: string[] = tickets.flatMap((t: any) =>
    (t.attachments ?? []).map((a: any) => a.fileKey as string)
  );
  const urlCache = new Map<string, string>();
  await Promise.all(
    allKeys.map(async (key) => {
      if (!urlCache.has(key)) urlCache.set(key, await resolveFileUrl(key));
    })
  );

  return tickets.map((t: any) => ({
    id: t._id.toString(),
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
    notes: (t.notes ?? []).map((n: any) => ({
      text: n.text,
      authorRole: n.authorRole,
      createdAt: new Date(n.createdAt).toISOString(),
    })),
    resolvedAt: t.resolvedAt ? new Date(t.resolvedAt).toISOString() : null,
    createdAt: new Date(t.createdAt).toISOString(),
  }));
}

export async function submitMaintenanceTicket(
  tenantUserId: string,
  data: { tenancyId: string; title: string; description: string; issueType?: MaintenanceIssueType; severity: MaintenanceSeverity; attachments?: { fileKey: string; fileName: string; fileType: string }[] }
): Promise<MaintenanceTicketDTO> {
  if (!mongoose.Types.ObjectId.isValid(data.tenancyId)) throw new AppError('Invalid tenancyId', 400);

  const tenancy = await TenancyModel.findOne({
    _id: new mongoose.Types.ObjectId(data.tenancyId),
    tenantUserId: new mongoose.Types.ObjectId(tenantUserId),
  }).lean();

  if (!tenancy) throw new AppError('Tenancy not found', 404);

  const unit = await UnitModel.findById(tenancy.unitId).lean();
  if (!unit) throw new AppError('Unit not found', 404);

  const property = await PropertyModel.findById((unit as any).propertyId).lean();
  if (!property) throw new AppError('Property not found', 404);

  const ticket = await MaintenanceTicketModel.create({
    orgId: (property as any).orgId,
    propertyId: (property as any)._id,
    unitId: (unit as any)._id,
    tenantUserId: new mongoose.Types.ObjectId(tenantUserId),
    title: data.title,
    description: data.description,
    issueType: data.issueType ?? 'GENERAL',
    severity: data.severity,
    status: 'OPEN',
    creditsAwarded: 0,
    attachments: data.attachments ?? [],
  });

  // Log activity so landlord sees it in their notification bell
  ActivityModel.create({
    orgId: (property as any).orgId,
    entity: { type: 'maintenance', id: (ticket as any)._id },
    actorId: new mongoose.Types.ObjectId(tenantUserId),
    action: 'MAINTENANCE_SUBMITTED',
    meta: { title: data.title, severity: data.severity },
    createdAt: new Date(),
  }).catch(() => {});

  const ownerMembership = await Membership.findOne({ orgId: (property as any).orgId, roleInOrg: 'OWNER' }).lean().catch(() => null);
  if (ownerMembership) {
    notify({
      recipientId: (ownerMembership as any).userId,
      recipientRole: 'landlord',
      landlordId: (ownerMembership as any).userId,
      propertyId: (property as any)._id,
      unitId: (unit as any)._id,
      tenantId: new mongoose.Types.ObjectId(tenantUserId),
      eventType: 'MAINTENANCE_SUBMITTED',
      eventTitle: 'Maintenance request submitted',
      eventDescription: `${data.title} — ${(property as any).name}, Unit ${(unit as any).unitNumber ?? ''}`.trim(),
    });
  }

  const resolvedAttachments = await Promise.all(
    (ticket.attachments ?? []).map(async (a: any) => ({
      fileKey: a.fileKey,
      fileName: a.fileName,
      fileType: a.fileType,
      url: await resolveFileUrl(a.fileKey),
    }))
  );

  const result: MaintenanceTicketDTO = {
    id: (ticket as any)._id.toString(),
    title: ticket.title,
    description: ticket.description,
    issueType: ticket.issueType,
    severity: ticket.severity,
    status: ticket.status,
    statusLabel: MAINTENANCE_STATUS_LABELS[ticket.status] ?? ticket.status,
    rewardEligible: ticket.rewardEligible ?? null,
    rewardDecision: ticket.rewardDecision ?? 'PENDING',
    creditsAwarded: ticket.creditsAwarded,
    attachments: resolvedAttachments,
    notes: [],
    resolvedAt: null,
    createdAt: new Date((ticket as any).createdAt).toISOString(),
  };

  // Send email to landlord org owner
  try {
    if (isEmailConfigured()) {
      const membership = await Membership.findOne({ orgId: (property as any).orgId, roleInOrg: 'OWNER' }).lean();
      if (membership) {
        const landlord = await UserModel.findById((membership as any).userId).lean() as any;
        const tenant = await UserModel.findById(new mongoose.Types.ObjectId(tenantUserId)).lean() as any;
        const tenantName = tenant?.profile?.firstName
          ? `${tenant.profile.firstName} ${tenant.profile.lastName ?? ''}`.trim()
          : tenant?.email ?? 'A tenant';
        if (landlord?.email) {
          await sendTransactionalEmail({
            to: landlord.email,
            subject: `New Maintenance Request — ${property.name}`,
            text: `${tenantName} submitted a maintenance request.\n\nTitle: ${data.title}\nDescription: ${data.description || 'N/A'}\nSeverity: ${data.severity}\n\nLog in to KeyPath to review and update the status.`,
            html: buildMaintenanceEmailHtml({
              tenantName,
              propertyName: (property as any).name,
              unitNumber: (unit as any).unitNumber,
              title: data.title,
              description: data.description,
              severity: data.severity,
            }),
          });
        }
      }
    }
  } catch {
    // email failure must not block the response
  }

  return result;
}

function buildMaintenanceEmailHtml(opts: {
  tenantName: string; propertyName: string; unitNumber: string;
  title: string; description: string; severity: string;
}): string {
  const { tenantName, propertyName, unitNumber, title, description, severity } = opts;
  const severityColor = severity === 'HIGH' ? '#dc2626' : severity === 'MEDIUM' ? '#d97706' : '#16a34a';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
  <tr><td align="center">
    <table width="560" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
      <tr><td style="background:linear-gradient(135deg,#115e59,#0f766e);padding:28px 32px;">
        <div style="font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.7);">KeyPath</div>
        <div style="font-size:22px;font-weight:700;color:#fff;margin-top:8px;">New Maintenance Request</div>
        <div style="font-size:14px;color:rgba(255,255,255,0.85);margin-top:6px;">${propertyName} — Unit ${unitNumber}</div>
      </td></tr>
      <tr><td style="padding:28px 32px;">
        <p style="margin:0 0 20px;font-size:15px;color:#334155;">
          <strong>${tenantName}</strong> has submitted a new maintenance request that needs your attention.
        </p>
        <table width="100%" style="background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:24px;">
          <tr><td style="padding:16px 20px;">
            <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#64748b;margin-bottom:6px;">Issue</div>
            <div style="font-size:16px;font-weight:600;color:#0f172a;">${title}</div>
            ${description ? `<div style="margin-top:10px;font-size:14px;color:#475569;line-height:1.6;">${description}</div>` : ''}
            <div style="margin-top:14px;">
              <span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;background:${severityColor}20;color:${severityColor};">${severity} severity</span>
            </div>
          </td></tr>
        </table>
        <table width="100%"><tr><td align="center">
          <a href="${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/dashboard/landlord/maintenance"
            style="display:inline-block;padding:14px 28px;background:#0f766e;color:#fff;text-decoration:none;font-size:15px;font-weight:600;border-radius:10px;">
            Review Request
          </a>
        </td></tr></table>
        <p style="margin:20px 0 0;font-size:13px;color:#94a3b8;text-align:center;">Log in to KeyPath to update the status and award credits.</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}
