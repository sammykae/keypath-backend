import crypto from "crypto";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

import { User } from "../../auth/models/user.model";
import { TenantModel } from "../../tenant/models/tenants.models";
import { PropertyModel } from "../../properties/models/propertyModel";
import { UnitModel } from "../../units/models/unit.model";
import { AppError } from "../../../core/errors/AppError";
import { writeAuditEvent } from "../../audit/services/audit.service";
import { TenantInviteModel } from "../models/tenantInvite.model";
import { CreateTenantInviteDTO, VerifyInviteQueryDTO } from "../dto/tenantInviteDTO";
import { CreateTenantInviteSchema, VerifyInviteQuerySchema } from "../dto/tenantInviteDTO";
import {
  buildKeypathTenantInviteEmailHtml,
  getTenantInviteBaseUrl,
} from "../../../core/email/sendTransactionalEmail";
import { isEmailReady, sendEmail, escapeHtml } from "../../../core/email/eb.sendgrid.service";
import { generateJwt } from "../../../core/config/passport";
import { TenancyModel } from "../../tenancies/models/tenancyModel";
import { resolveProgramConfig } from "../../program-config/services/programConfig.service";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * The single completion entry point for every tenant invite, regardless of which
 * service created it. Anything that emails or hands out an invite must use this
 * so there is exactly one screen that can accept an invite.
 */
export function buildAcceptInviteUrl(inviteToken: string): string {
  return `${getTenantInviteBaseUrl()}/accept-invite?token=${inviteToken}`;
}

/** Avoid showing placeholder DB values like literal "string"; prefer label when unitNumber is junk. */
function formatUnitLabelForEmail(unit: { unitNumber?: unknown; label?: unknown } | null): string {
  if (!unit) return "";
  const raw = (v: unknown) => (typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "");
  const num = raw(unit.unitNumber);
  const lbl = raw(unit.label);
  const junk = (s: string) => !s || /^string$/i.test(s);
  if (!junk(num)) return num;
  if (!junk(lbl)) return lbl;
  return "";
}

function placeholderFullNameFromEmail(email: string): string {
  const local = email.split("@")[0] || "";
  const words = local
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);

  const full = words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return full.length >= 2 ? full : "Tenant";
}

function computeRequiredAgreements(participationModel: CreateTenantInviteDTO["participationModel"]): CreateTenantInviteDTO["requiredAgreements"] {
  switch (participationModel) {
    case "RPA_ONLY":
      return ["RPA"];
    case "TEPA_ONLY":
      return ["TEPA"];
    case "BOTH":
      return ["RPA_AND_TEPA"];
    default:
      return ["RPA_AND_TEPA"];
  }
}

/**
 * Reserve the TENANT user the invite will activate.
 *
 * The account is created without a password and left PENDING: the tenant proves
 * they own the inbox with a one-time code and chooses their own password in
 * `verifyInviteOtp`. Nothing here is a usable credential, so an unaccepted
 * invite can never be signed into.
 */
export async function ensureTenantUserForInvite(
  email: string
): Promise<{ createdNewUser: boolean }> {
  const normalized = normalizeEmail(email);
  const existing = await User.findOne({ email: normalized }).lean();
  if (existing) {
    return { createdNewUser: false };
  }
  await User.create({
    email: normalized,
    passwordHash: null,
    role: "TENANT",
    status: "PENDING",
    oauthProviders: [],
    profile: {},
  });
  return { createdNewUser: true };
}

/** Mark pending (SENT, not expired) invites for this email as ACCEPTED — call after successful login/register. */
export async function acceptPendingInvitesForEmail(email: string): Promise<number> {
  const normalized = normalizeEmail(email);
  const now = new Date();
  const res = await TenantInviteModel.updateMany(
    {
      tenantEmail: normalized,
      status: "SENT",
      expiresAt: { $gt: now },
    },
    { $set: { status: "ACCEPTED", acceptedAt: now } }
  );
  return res.modifiedCount ?? 0;
}

export async function createInvite(data: CreateTenantInviteDTO, actor?: { _id?: string }) {
  const parsed = CreateTenantInviteSchema.parse(data);

  if (!mongoose.Types.ObjectId.isValid(parsed.propertyId)) {
    throw new AppError("Invalid propertyId", 400);
  }
  if (!mongoose.Types.ObjectId.isValid(parsed.unitId)) {
    throw new AppError("Invalid unitId", 400);
  }

  const propertyId = new mongoose.Types.ObjectId(parsed.propertyId);
  const unitId = new mongoose.Types.ObjectId(parsed.unitId);
  const tenantEmail = normalizeEmail(parsed.tenantEmail);

  // Optional checks to fail early if references are invalid
  if (!(await PropertyModel.exists({ _id: propertyId }))) {
    throw new AppError("Property not found", 404);
  }
  if (!(await UnitModel.exists({ _id: unitId, propertyId }))) {
    throw new AppError("Unit not found for given property", 404);
  }

  const inviteToken = crypto.randomBytes(32).toString("hex");
  const inviteCode = parsed.inviteMethod === "CODE" || parsed.inviteMethod === "BOTH"
    ? String(Math.floor(100000 + Math.random() * 900000))
    : undefined;

  // Pre-fill from the program-config hierarchy when the caller didn't choose explicitly
  let participationModel = parsed.participationModel;
  if (!participationModel) {
    const resolved = await resolveProgramConfig({ unitId: parsed.unitId });
    // NONE has no invite equivalent — default those to RPA_ONLY
    participationModel = resolved.programType === 'NONE' ? 'RPA_ONLY' : resolved.programType;
  }

  const requiredAgreements = parsed.requiredAgreements?.length
    ? parsed.requiredAgreements
    : computeRequiredAgreements(participationModel);

  const defaultExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
  const expiresAt = parsed.expiresAt ?? defaultExpires;
  if (expiresAt.getTime() <= Date.now()) {
    throw new AppError("expiresAt must be in the future", 400);
  }

  // Create tenant placeholder (starts as INVITED)
  const tenant =
    (await TenantModel.findOne({ email: tenantEmail }).lean().exec()) ??
    (await TenantModel.create({
      fullName: placeholderFullNameFromEmail(tenantEmail),
      email: tenantEmail,
      phone: undefined,
      status: "INVITED",
      source: "INVITE",
      invitedByUserId: actor?._id ? new mongoose.Types.ObjectId(actor._id) : undefined,
    }));

  const tenantId = (tenant as any)._id as mongoose.Types.ObjectId;

  const invite = await TenantInviteModel.create({
    tenantId,
    tenantEmail,
    propertyId,
    unitId,
    participationModel,
    inviteMethod: parsed.inviteMethod,
    deliveryMethod: parsed.deliveryMethod,
    requiredAgreements,
    inviteCode,
    inviteToken,
    status: "SENT",
    expiresAt,
    leaseStartDate: parsed.leaseStartDate,
    leaseEndDate: parsed.leaseEndDate,
  });

  const [propertyDoc, unitDoc] = await Promise.all([
    PropertyModel.findById(propertyId).select("name orgId").lean(),
    UnitModel.findById(unitId).select("unitNumber label").lean(),
  ]);

  if (actor?._id && mongoose.Types.ObjectId.isValid(actor._id)) {
    await writeAuditEvent({
      actorUserId: new mongoose.Types.ObjectId(actor._id),
      orgId: (propertyDoc as { orgId?: mongoose.Types.ObjectId } | null)?.orgId,
      action: "TENANT_INVITE_CREATED",
      entityType: "TENANT",
      entityId: invite._id,
      propertyId,
      tenantId,
      metadata: { tenantEmail, unitId: unitId.toString() },
      diff: { before: null, after: { status: "SENT" } },
    });
  }
  const propertyName = (propertyDoc as { name?: string } | null)?.name ?? "your property";
  const unitNumber = formatUnitLabelForEmail(
    unitDoc as { unitNumber?: unknown; label?: unknown } | null
  );

  let emailSent = false;
  const acceptUrl = buildAcceptInviteUrl(inviteToken);

  if (parsed.deliveryMethod === "KEYPATH_EMAIL") {
    await ensureTenantUserForInvite(tenantEmail);
    if (isEmailReady()) {
      try {
        const leaseSummary =
          parsed.leaseStartDate || parsed.leaseEndDate
            ? `${parsed.leaseStartDate ? parsed.leaseStartDate.toISOString().slice(0, 10) : "?"} → ${parsed.leaseEndDate ? parsed.leaseEndDate.toISOString().slice(0, 10) : "?"}`
            : "";

        const expiresDisplay = expiresAt.toLocaleString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        });

        const textBody = [
          `Hello,`,
          ``,
          `You've been invited to join ${propertyName} on KeyPath.`,
          ``,
          `Open this link to accept:`,
          acceptUrl,
          ``,
          `We'll email you a 6-digit code to confirm it's you, then you choose your own password.`,
          ``,
          `Property: ${propertyName}`,
          unitNumber ? `Unit: ${unitNumber}` : "",
          leaseSummary ? `Lease: ${leaseSummary}` : "",
          ``,
          `This invitation expires: ${expiresDisplay}`,
          ``,
          `— KeyPath`,
        ]
          .filter(Boolean)
          .join("\n");

        await sendEmail({
          to: tenantEmail,
          subject: `You're invited to ${propertyName}`,
          text: textBody,
          html: buildKeypathTenantInviteEmailHtml({
            propertyName,
            unitNumber,
            leaseSummary,
            expiresDisplay,
            acceptUrl,
            tenantEmail,
          }),
        });
        emailSent = true;
      } catch (err) {
        console.error("[invites] KEYPATH_EMAIL send failed:", err);
      }
    }
  }

  // The tenant got their own link by email — don't hand the landlord a second
  // copy of the credential they have no need to see.
  if (parsed.deliveryMethod === "KEYPATH_EMAIL" && emailSent) {
    return { inviteId: invite._id, emailSent, acceptance: "OTP" as const };
  }

  return {
    inviteId: invite._id,
    inviteToken,
    inviteCode: invite.inviteCode,
    inviteUrl: acceptUrl,
    emailSent,
    acceptance: "OTP" as const,
  };
}

export async function verifyInvite(tokenInput: VerifyInviteQueryDTO) {
  const parsed = VerifyInviteQuerySchema.parse(tokenInput);
  const now = new Date();

  const invite = await TenantInviteModel.findOne(
    parsed.token ? { inviteToken: parsed.token } : { inviteCode: parsed.code }
  ).lean().exec();
  if (!invite) return { ok: false as const, error: "invalid_token" };
  if (invite.status === "CANCELLED") return { ok: false as const, error: "invalid_token" };
  if (invite.status === "EXPIRED" || invite.expiresAt <= now) {
    return { ok: false as const, error: "expired_token" };
  }
  if (invite.status === "ACCEPTED") {
    // Recovery: activate any still-PENDING tenancy (handles the $set bug from prior deploys)
    try {
      const acceptedUser = await User.findOne({ email: invite.tenantEmail.toLowerCase() }).lean().exec();
      if (acceptedUser) {
        const recovered = await TenancyModel.findOneAndUpdate(
          { unitId: invite.unitId, status: "PENDING" },
          { $set: { status: "ACTIVE", tenantUserId: (acceptedUser as any)._id } },
          { new: true }
        );
        if (recovered) {
          await UnitModel.findByIdAndUpdate(recovered.unitId, { $set: { status: "OCCUPIED" } });
        }
      }
    } catch { /* non-critical recovery, swallow */ }
    return { ok: false as const, error: "already_accepted" };
  }

  const [property, unit, inviteeUser] = await Promise.all([
    PropertyModel.findById(invite.propertyId).lean().exec(),
    UnitModel.findById(invite.unitId).lean().exec(),
    User.findOne({ email: invite.tenantEmail.toLowerCase() }).select("passwordHash").lean().exec(),
  ]);

  const propertyName = property?.name ?? "";
  const unitNumber = unit?.unitNumber ?? "";

  return {
    ok: true as const,
    // Owning the invite link is not proof of owning the inbox, so acceptance
    // always goes through a one-time code — same contract as the PM flow.
    requiresOtp: true as const,
    requiresLoginToAccept: false as const,
    // Invitees who were provisioned by a landlord have no password yet; the
    // accept screen collects one alongside the code so they end up with a
    // durable credential rather than a link-only account.
    hasPassword: Boolean((inviteeUser as { passwordHash?: string | null } | null)?.passwordHash),
    summary: {
      email: invite.tenantEmail,
      propertyName,
      unit: unitNumber,
      leaseStart: invite.leaseStartDate ? invite.leaseStartDate.toISOString().slice(0, 10) : "",
      leaseEnd: invite.leaseEndDate ? invite.leaseEndDate.toISOString().slice(0, 10) : "",
    },
  };
}

export async function sendInviteOtp(token: string): Promise<{ ok: true; email: string }> {
  const invite = await TenantInviteModel.findOne({ inviteToken: token }).exec();
  if (!invite) throw new AppError("invalid_token", 400);
  if (invite.status === "ACCEPTED") throw new AppError("already_accepted", 400);
  if (invite.status === "CANCELLED") throw new AppError("invalid_token", 400);
  if (invite.expiresAt <= new Date()) throw new AppError("expired_token", 400);

  // 60s rate limit between sends
  if (invite.otpSentAt && Date.now() - invite.otpSentAt.getTime() < 60_000) {
    throw new AppError("otp_rate_limit", 429);
  }

  const otp = String(Math.floor(100_000 + Math.random() * 900_000));
  const otpHash = await bcrypt.hash(otp, 10);
  const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await TenantInviteModel.findByIdAndUpdate(invite._id, { otpHash, otpExpiresAt, otpSentAt: new Date() });

  const emailSans = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
  if (isEmailReady()) {
    await sendEmail({
      to: invite.tenantEmail,
      subject: "Your KeyPath verification code",
      text: `Your KeyPath verification code is: ${otp}\n\nThis code expires in 10 minutes.`,
      html: `<!DOCTYPE html><html><body style="margin:0;padding:32px 16px;background:#e8eef2;font-family:${emailSans};">
        <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
          <div style="font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#0f766e;">KeyPath</div>
          <h2 style="margin:16px 0 8px;font-size:22px;color:#0f172a;">Verification code</h2>
          <p style="color:#64748b;margin:0 0 24px;">Enter this code to access your KeyPath account:</p>
          <div style="font-size:36px;font-weight:700;letter-spacing:8px;color:#0f172a;background:#f0fdfa;border:1px solid #99f6e4;border-radius:10px;padding:18px;text-align:center;">${escapeHtml(otp)}</div>
          <p style="color:#94a3b8;font-size:13px;margin:20px 0 0;">This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
        </div>
      </body></html>`
    });
  } else {
    console.log(`[invites] OTP for ${invite.tenantEmail}: ${otp}`);
  }

  return { ok: true, email: invite.tenantEmail };
}

export async function verifyInviteOtp(
  token: string,
  otp: string,
  password?: string
): Promise<{ ok: true; authToken: string; user: object }> {
  const invite = await TenantInviteModel.findOne({ inviteToken: token }).exec();
  if (!invite) throw new AppError("invalid_token", 400);
  if (invite.status === "ACCEPTED" || invite.status === "CANCELLED") throw new AppError("invalid_token", 400);
  if (invite.expiresAt <= new Date()) throw new AppError("expired_token", 400);
  if (!invite.otpHash || !invite.otpExpiresAt) throw new AppError("otp_not_sent", 400);
  if (invite.otpExpiresAt <= new Date()) throw new AppError("otp_expired", 400);

  const valid = await bcrypt.compare(otp, invite.otpHash);
  if (!valid) throw new AppError("invalid_otp", 400);

  // Find the tenant user (reserved when the invite was created)
  const userDoc = await User.findOne({ email: invite.tenantEmail.toLowerCase() }).lean().exec();
  if (!userDoc) throw new AppError("user_not_found", 404);

  // A landlord-provisioned invitee has no password yet. The correct code proves
  // they own the inbox, so this is the one moment we can safely let them set one
  // — and we require it, so nobody ends up with a link-only account.
  const needsPassword = !(userDoc as any).passwordHash;
  const userUpdate: Record<string, unknown> = {};

  if (needsPassword) {
    if (!password || password.length < 8) throw new AppError("password_required", 400);
    userUpdate.passwordHash = await bcrypt.hash(password, 12);
  }

  // Accepting an invite grants tenant access and completes activation.
  if ((userDoc as any).role !== "TENANT") userUpdate.role = "TENANT";
  if ((userDoc as any).status !== "ACTIVE") userUpdate.status = "ACTIVE";

  if (Object.keys(userUpdate).length > 0) {
    await User.findByIdAndUpdate((userDoc as any)._id, { $set: userUpdate });
  }
  const user: any = { ...(userDoc as any), ...userUpdate, role: "TENANT", status: "ACTIVE" };

  await TenantInviteModel.findByIdAndUpdate(invite._id, {
    $set: { status: "ACCEPTED", acceptedAt: new Date(), otpHash: null },
  });

  // Activate the tenant's PENDING tenancy and mark unit occupied
  const activatedTenancy = await TenancyModel.findOneAndUpdate(
    { tenantUserId: (user as any)._id, unitId: invite.unitId, status: "PENDING" },
    { $set: { status: "ACTIVE" } },
    { new: true }
  );
  if (!activatedTenancy) {
    // Fallback: match by unitId only in case tenantUserId linkage differs
    const fallback = await TenancyModel.findOneAndUpdate(
      { unitId: invite.unitId, status: "PENDING" },
      { $set: { status: "ACTIVE", tenantUserId: (user as any)._id } },
      { new: true }
    );
    if (fallback) {
      await UnitModel.findByIdAndUpdate(fallback.unitId, { $set: { status: "OCCUPIED" } });
    }
  } else {
    await UnitModel.findByIdAndUpdate(activatedTenancy.unitId, { $set: { status: "OCCUPIED" } });
  }

  const authToken = generateJwt(user);

  return {
    ok: true,
    authToken,
    user: {
      id: (user as any)._id.toString(),
      email: user.email,
      role: ((user as any).role ?? "TENANT").toUpperCase(),
      status: ((user as any).status ?? "ACTIVE").toUpperCase(),
      phone: user.phone,
      profile: user.profile ?? {},
    },
  };
}

// Re-send the magic link invite email. Accepts either inviteId or tenant email.
export async function resendInvite(
  input: { inviteId?: string; email?: string }
): Promise<{ ok: true; message: string }> {
  const now = new Date();

  let invite;
  if (input.inviteId && mongoose.Types.ObjectId.isValid(input.inviteId)) {
    invite = await TenantInviteModel.findById(input.inviteId).exec();
  } else if (input.email) {
    invite = await TenantInviteModel.findOne({
      tenantEmail: normalizeEmail(input.email),
      status: { $in: ["SENT", "PENDING"] },
    })
      .sort({ createdAt: -1 })
      .exec();
  }

  if (!invite) throw new AppError("Invite not found", 404);
  if (invite.status === "ACCEPTED") throw new AppError("Invite already accepted", 409);
  if (invite.status === "CANCELLED") throw new AppError("Invite is cancelled", 400);

  // Extend expiry by 24 hours from now if it would expire sooner
  const newExpiry = new Date(Math.max(invite.expiresAt.getTime(), now.getTime() + 24 * 60 * 60 * 1000));
  await TenantInviteModel.findByIdAndUpdate(invite._id, {
    $set: { expiresAt: newExpiry, status: "SENT" },
  });

  // Invites created before the user existed would otherwise fail at verify-otp.
  await ensureTenantUserForInvite(invite.tenantEmail);

  const [propertyDoc, unitDoc] = await Promise.all([
    PropertyModel.findById(invite.propertyId).select("name").lean(),
    UnitModel.findById(invite.unitId).select("unitNumber label").lean(),
  ]);

  const propertyName = (propertyDoc as { name?: string } | null)?.name ?? "your property";
  const unitNumber = formatUnitLabelForEmail(unitDoc as { unitNumber?: unknown; label?: unknown } | null);
  const acceptUrl = buildAcceptInviteUrl(invite.inviteToken);

  const leaseSummary =
    invite.leaseStartDate || invite.leaseEndDate
      ? `${invite.leaseStartDate ? invite.leaseStartDate.toISOString().slice(0, 10) : "?"} → ${invite.leaseEndDate ? invite.leaseEndDate.toISOString().slice(0, 10) : "?"}`
      : "";

  const expiresDisplay = newExpiry.toLocaleString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });

  if (isEmailReady()) {
    await sendEmail({
      to: invite.tenantEmail,
      subject: `Your new invite link for ${propertyName}`,
      text: [
        `Hello,`,
        ``,
        `Here is your updated invite link for ${propertyName}${unitNumber ? `, Unit ${unitNumber}` : ""}:`,
        ``,
        acceptUrl,
        ``,
        leaseSummary ? `Lease: ${leaseSummary}` : "",
        `This link expires: ${expiresDisplay}`,
        ``,
        `— KeyPath`,
      ].filter(Boolean).join("\n"),
      html: buildKeypathTenantInviteEmailHtml({
        propertyName,
        unitNumber,
        leaseSummary,
        expiresDisplay,
        acceptUrl,
        tenantEmail: invite.tenantEmail,
      }),
    });
  } else {
    console.log(`[invites] Resend magic link for ${invite.tenantEmail}: ${acceptUrl}`);
  }

  return { ok: true, message: "A new invite link has been sent to your email" };
}
