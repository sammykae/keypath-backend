import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { PropertyManagerInviteModel } from '../models/propertyManagerInvite.model';
import { User } from '../../auth/models/user.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { AuditEvent } from '../../audit/models/audit-log.model';
import { resolveLandlordOrgId } from '../../landlord/services/landlordDashboard.service';
import { generateJwt } from '../../../core/config/passport';
import {
  sendTransactionalEmail,
  isEmailConfigured,
  escapeHtml,
  getTenantInviteBaseUrl,
} from '../../../core/email/sendTransactionalEmail';

/** Statuses that mean the invite link/OTP flow can no longer proceed. */
const TERMINAL_STATUSES = ['ACCEPTED', 'DECLINED', 'REVOKED'];

const INVITE_TTL_DAYS = 7;
const OTP_TTL_MINUTES = 10;
const OTP_RESEND_COOLDOWN_MS = 60_000;

/**
 * Create (or reuse) an activation invite for a newly-assigned Property
 * Manager and email it. No-op if the PM account is already ACTIVE — an
 * activated PM doesn't need to re-verify for additional property
 * assignments, they just log in and see the new property.
 */
export async function maybeSendPMActivationInvite(params: {
  propertyManagerUserId: mongoose.Types.ObjectId;
  assignmentId: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  email: string;
}): Promise<void> {
  const pmUser = await User.findById(params.propertyManagerUserId).lean();
  if (!pmUser || (pmUser as any).status !== 'PENDING') return; // already activated

  const existing = await PropertyManagerInviteModel.findOne({
    propertyManagerUserId: params.propertyManagerUserId,
    status: { $in: ['SENT', 'OPENED'] },
    expiresAt: { $gt: new Date() },
  }).lean();

  const inviteToken = existing ? (existing as any).inviteToken : crypto.randomBytes(32).toString('hex');

  if (!existing) {
    await PropertyManagerInviteModel.create({
      propertyManagerUserId: params.propertyManagerUserId,
      assignmentId: params.assignmentId,
      orgId: params.orgId,
      propertyId: params.propertyId,
      email: params.email,
      inviteToken,
      status: 'SENT',
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
    });
  }

  const property = await PropertyModel.findById(params.propertyId).lean();
  const signInUrl = `${getTenantInviteBaseUrl()}/pm-activate?token=${inviteToken}`;

  try {
    if (isEmailConfigured()) {
      await sendTransactionalEmail({
        to: params.email,
        subject: 'You have been added as a Property Manager on KeyPath',
        text: `You've been assigned to manage ${(property as any)?.name ?? 'a property'} on KeyPath.\n\nActivate your account: ${signInUrl}\n\nThis link expires in ${INVITE_TTL_DAYS} days.`,
        html: buildPMInviteEmailHtml({
          propertyName: (property as any)?.name ?? 'a property',
          signInUrl,
        }),
      });
    } else {
      console.log(`[pm-invite] Activation link for ${params.email}: ${signInUrl}`);
    }
  } catch {
    // email failure must not block the assignment
  }
}

function buildPMInviteEmailHtml(opts: { propertyName: string; signInUrl: string }): string {
  const { propertyName, signInUrl } = opts;
  return `<!DOCTYPE html><html><body style="margin:0;padding:32px 16px;background:#e8eef2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#0f766e;">KeyPath</div>
      <h2 style="margin:16px 0 8px;font-size:22px;color:#0f172a;">You've been added as a Property Manager</h2>
      <p style="color:#64748b;margin:0 0 24px;">You can now help manage <strong>${escapeHtml(propertyName)}</strong> on KeyPath.</p>
      <a href="${signInUrl}" style="display:inline-block;padding:14px 28px;background:#0f766e;color:#fff;text-decoration:none;font-size:15px;font-weight:600;border-radius:10px;">Activate Your Account</a>
      <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;">This link expires in ${INVITE_TTL_DAYS} days.</p>
    </div>
  </body></html>`;
}

/** GET-style check: is this invite token still valid, and what does it activate? Marks SENT → OPENED on first view. */
export async function verifyPMInvite(token: string) {
  const invite = await PropertyManagerInviteModel.findOne({ inviteToken: token });
  if (!invite) throw new AppError('invalid_token', 400);
  if (invite.status === 'REVOKED') throw new AppError('invalid_token', 400);
  if (invite.status === 'DECLINED') throw new AppError('invalid_token', 400);
  if (invite.status === 'ACCEPTED') throw new AppError('already_accepted', 400);
  if (invite.expiresAt <= new Date()) throw new AppError('expired_token', 400);

  if (invite.status === 'SENT') {
    invite.status = 'OPENED';
    await invite.save();
  }

  const property = await PropertyModel.findById(invite.propertyId).lean();
  return {
    email: invite.email,
    propertyName: (property as any)?.name ?? '',
  };
}

/** Send (or resend, rate-limited) the OTP for an invite. */
export async function sendPMInviteOtp(token: string): Promise<{ email: string }> {
  const invite = await PropertyManagerInviteModel.findOne({ inviteToken: token });
  if (!invite) throw new AppError('invalid_token', 400);
  if (TERMINAL_STATUSES.includes(invite.status)) {
    throw new AppError(invite.status === 'ACCEPTED' ? 'already_accepted' : 'invalid_token', 400);
  }
  if (invite.expiresAt <= new Date()) throw new AppError('expired_token', 400);

  if (invite.otpSentAt && Date.now() - invite.otpSentAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    throw new AppError('otp_rate_limit', 429);
  }

  const otp = String(Math.floor(100_000 + Math.random() * 900_000));
  invite.otpHash = await bcrypt.hash(otp, 10);
  invite.otpExpiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  invite.otpSentAt = new Date();
  await invite.save();

  try {
    if (isEmailConfigured()) {
      await sendTransactionalEmail({
        to: invite.email,
        subject: 'Your KeyPath verification code',
        text: `Your KeyPath verification code is: ${otp}\n\nThis code expires in ${OTP_TTL_MINUTES} minutes.`,
        html: `<!DOCTYPE html><html><body style="margin:0;padding:32px 16px;background:#e8eef2;font-family:sans-serif;">
          <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
            <div style="font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#0f766e;">KeyPath</div>
            <h2 style="margin:16px 0 8px;font-size:22px;color:#0f172a;">Verification code</h2>
            <div style="font-size:36px;font-weight:700;letter-spacing:8px;color:#0f172a;background:#f0fdfa;border:1px solid #99f6e4;border-radius:10px;padding:18px;text-align:center;">${escapeHtml(otp)}</div>
            <p style="color:#94a3b8;font-size:13px;margin:20px 0 0;">This code expires in ${OTP_TTL_MINUTES} minutes.</p>
          </div>
        </body></html>`,
      });
    } else {
      console.log(`[pm-invite] OTP for ${invite.email}: ${otp}`);
    }
  } catch {
    // email failure must not block the flow — OTP is still valid, PM can ask for a resend
  }

  return { email: invite.email };
}

/** Verify the OTP, activate the PM account, and return a session token. */
export async function verifyPMInviteOtp(
  token: string,
  otp: string
): Promise<{ authToken: string; user: Record<string, unknown> }> {
  const invite = await PropertyManagerInviteModel.findOne({ inviteToken: token });
  if (!invite) throw new AppError('invalid_token', 400);
  if (TERMINAL_STATUSES.includes(invite.status)) throw new AppError('invalid_token', 400);
  if (invite.expiresAt <= new Date()) throw new AppError('expired_token', 400);
  if (!invite.otpHash || !invite.otpExpiresAt) throw new AppError('otp_not_sent', 400);
  if (invite.otpExpiresAt <= new Date()) throw new AppError('otp_expired', 400);

  const valid = await bcrypt.compare(otp, invite.otpHash);
  if (!valid) throw new AppError('invalid_otp', 400);

  const pmUser = await User.findById(invite.propertyManagerUserId);
  if (!pmUser) throw new AppError('user_not_found', 404);

  pmUser.status = 'ACTIVE';
  await pmUser.save();

  invite.status = 'ACCEPTED';
  invite.acceptedAt = new Date();
  invite.otpHash = null;
  await invite.save();

  const authToken = generateJwt(pmUser);

  return {
    authToken,
    user: {
      id: pmUser._id.toString(),
      email: pmUser.email,
      role: pmUser.role,
      status: pmUser.status,
      profile: pmUser.profile ?? {},
    },
  };
}

/** PM declines the invitation — public, token-based, mirrors verify/accept. */
export async function declinePMInvite(token: string): Promise<void> {
  const invite = await PropertyManagerInviteModel.findOne({ inviteToken: token });
  if (!invite) throw new AppError('invalid_token', 400);
  if (TERMINAL_STATUSES.includes(invite.status)) {
    throw new AppError(invite.status === 'ACCEPTED' ? 'already_accepted' : 'invalid_token', 400);
  }
  if (invite.expiresAt <= new Date()) throw new AppError('expired_token', 400);

  invite.status = 'DECLINED';
  await invite.save();

  AuditEvent.create({
    actorUserId: invite.propertyManagerUserId,
    orgId: invite.orgId,
    action: 'PROPERTY_MANAGER_INVITE_DECLINED',
    entityType: 'propertyManagerInvite',
    entityId: invite._id,
    source: 'user',
    updateType: 'manual',
    propertyId: invite.propertyId,
    diff: { before: { status: 'SENT|OPENED' }, after: { status: 'DECLINED' } },
  }).catch(() => {});
}

async function findOrgScopedInvite(landlordUserId: mongoose.Types.ObjectId, assignmentId: string) {
  if (!mongoose.Types.ObjectId.isValid(assignmentId)) throw new AppError('Invalid assignment id', 400);
  const orgId = await resolveLandlordOrgId(landlordUserId);
  const invite = await PropertyManagerInviteModel.findOne({
    assignmentId: new mongoose.Types.ObjectId(assignmentId),
    orgId: new mongoose.Types.ObjectId(orgId),
  }).sort({ createdAt: -1 });
  if (!invite) throw new AppError('No invite found for this assignment', 404);
  return invite;
}

/** Landlord-facing: current invite status for one assignment (for the invitation status list UI). */
export async function getPMInviteStatusForAssignment(
  landlordUserId: mongoose.Types.ObjectId,
  assignmentId: string
) {
  const invite = await findOrgScopedInvite(landlordUserId, assignmentId);
  return {
    status: invite.status,
    email: invite.email,
    sentAt: invite.createdAt.toISOString(),
    expiresAt: invite.expiresAt.toISOString(),
    acceptedAt: invite.acceptedAt ? invite.acceptedAt.toISOString() : null,
  };
}

/** Landlord-facing: resend the activation email for a not-yet-accepted invite, extending its expiry. */
export async function resendPMInvite(landlordUserId: mongoose.Types.ObjectId, assignmentId: string) {
  const invite = await findOrgScopedInvite(landlordUserId, assignmentId);
  if (TERMINAL_STATUSES.includes(invite.status)) {
    throw new AppError(`Cannot resend a ${invite.status.toLowerCase()} invite`, 400);
  }

  invite.expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  await invite.save();

  const property = await PropertyModel.findById(invite.propertyId).lean();
  const signInUrl = `${getTenantInviteBaseUrl()}/pm-activate?token=${invite.inviteToken}`;

  try {
    if (isEmailConfigured()) {
      await sendTransactionalEmail({
        to: invite.email,
        subject: 'Reminder: activate your Property Manager account on KeyPath',
        text: `Activate your account: ${signInUrl}\n\nThis link expires in ${INVITE_TTL_DAYS} days.`,
        html: buildPMInviteEmailHtml({ propertyName: (property as any)?.name ?? 'a property', signInUrl }),
      });
    } else {
      console.log(`[pm-invite] Resent activation link for ${invite.email}: ${signInUrl}`);
    }
  } catch {
    // email failure must not block the resend action — link is still valid
  }

  AuditEvent.create({
    actorUserId: landlordUserId,
    orgId: invite.orgId,
    action: 'PROPERTY_MANAGER_INVITE_RESENT',
    entityType: 'propertyManagerInvite',
    entityId: invite._id,
    source: 'user',
    updateType: 'manual',
    propertyId: invite.propertyId,
  }).catch(() => {});

  return { resent: true, expiresAt: invite.expiresAt.toISOString() };
}

/** Landlord-facing: revoke a not-yet-accepted invite — the link stops working immediately. */
export async function revokePMInvite(landlordUserId: mongoose.Types.ObjectId, assignmentId: string) {
  const invite = await findOrgScopedInvite(landlordUserId, assignmentId);
  if (invite.status === 'ACCEPTED') throw new AppError('Cannot revoke an already-accepted invite', 400);
  if (invite.status === 'REVOKED') throw new AppError('Invite is already revoked', 400);

  const before = invite.status;
  invite.status = 'REVOKED';
  await invite.save();

  AuditEvent.create({
    actorUserId: landlordUserId,
    orgId: invite.orgId,
    action: 'PROPERTY_MANAGER_INVITE_REVOKED',
    entityType: 'propertyManagerInvite',
    entityId: invite._id,
    source: 'user',
    updateType: 'manual',
    propertyId: invite.propertyId,
    diff: { before: { status: before }, after: { status: 'REVOKED' } },
  }).catch(() => {});

  return { revoked: true };
}
