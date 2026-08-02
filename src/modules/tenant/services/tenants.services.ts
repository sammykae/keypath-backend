import bcrypt from "bcryptjs";
import crypto from "crypto";

import { TenantModel } from "../models/tenants.models";
import { SignupTenantDTO, SignupTenantSchema } from "../dto/signup.dto";
import {
  CreateTenantDTO,
  CreateTenantSchema,
  UpdateTenantDTO,
  VerifyTenantEmailDTO,
  VerifyTenantEmailSchema,
} from "../dto/tenantDTO";
import { AppError } from "../../../core/errors/AppError";
import { User } from "../../auth/models/user.model";
import mongoose from "mongoose";
import { writeAuditEvent } from "../../audit/services/audit.service";

const normalizeEmail = (email: string) => email.trim().toLowerCase();

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

// BE-201 core create: tenant identity independent of property/participation.
export const createTenantCore = async (
  data: CreateTenantDTO,
  actor?: { _id?: string; role?: string }
) => {
  const parsedData = CreateTenantSchema.parse(data);
  const normalizedEmail = normalizeEmail(parsedData.email);

  const existingTenant = await TenantModel.findOne({ email: normalizedEmail });
  if (existingTenant) throw new AppError("Tenant with this email already exists", 409);

  // Invite-only MVP: SELF_SIGNUP is not supported yet.
  if (parsedData.source !== "INVITE") {
    throw new AppError("SELF_SIGNUP is disabled in invite-only MVP", 403);
  }

  const status: "INVITED" = "INVITED";
  const invitedByUserId = actor?._id;

  const newTenant = new TenantModel({
    fullName: parsedData.fullName,
    email: normalizedEmail,
    phone: parsedData.phone,
    status,
    source: parsedData.source,
    invitedByUserId,
  });

  await newTenant.save();

  if (invitedByUserId && mongoose.Types.ObjectId.isValid(invitedByUserId)) {
    await writeAuditEvent({
      actorUserId: new mongoose.Types.ObjectId(invitedByUserId),
      action: "TENANT_CORE_INVITED",
      entityType: "TENANT",
      entityId: newTenant._id,
      metadata: { email: normalizedEmail },
      diff: { before: null, after: { status: "INVITED", source: parsedData.source } },
    });
  }

  return newTenant.toObject();
};

// Signup flow: still uses SignupTenantDTO but now creates ONLY tenant core identity.
export const createTenant = async (data: SignupTenantDTO | CreateTenantDTO, actorId?: string) => {
  // Signup payload includes password/employment/currentAddress, so treat it separately.
  if ("password" in data) {
    const parsedSignup = SignupTenantSchema.parse(data);
    const normalizedEmail = normalizeEmail(parsedSignup.email);

    const existingTenant = await TenantModel.findOne({ email: normalizedEmail });
    if (existingTenant) throw new AppError("Tenant with this email already exists", 409);

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) throw new AppError("Email already registered", 409);

    const [firstName, ...rest] = parsedSignup.fullName.trim().split(/\s+/);
    const lastName = rest.join(" ") || undefined;

    const passwordHash = await bcrypt.hash(parsedSignup.password, 12);
    const user = await User.create({
      email: normalizedEmail,
      phone: parsedSignup.phone,
      passwordHash,
      role: "TENANT",
      status: "ACTIVE",
      profile: { firstName, lastName },
    });

    const newTenant = new TenantModel({
      fullName: parsedSignup.fullName,
      email: normalizedEmail,
      phone: parsedSignup.phone,
      status: "ACTIVE",
      source: "SELF_SIGNUP",
    });

    await newTenant.save();
    await writeAuditEvent({
      actorUserId: user._id,
      action: "TENANT_SELF_SIGNUP",
      entityType: "TENANT",
      entityId: user._id,
      tenantId: user._id,
      metadata: { tenantRecordId: newTenant._id.toString(), email: normalizedEmail },
      diff: { before: null, after: { email: normalizedEmail } },
    });
    return newTenant.toObject();
  }

  // If caller passes core-identity fields, create as BE-201 core tenant.
  const parsedData = CreateTenantSchema.parse(data);
  const normalizedEmail = normalizeEmail(parsedData.email);

  const existingTenant = await TenantModel.findOne({ email: normalizedEmail });
  if (existingTenant) throw new AppError("Tenant with this email already exists", 409);

  const newTenant = new TenantModel({
    fullName: parsedData.fullName,
    email: normalizedEmail,
    phone: parsedData.phone,
    status: "INVITED",
    source: parsedData.source,
  });

  await newTenant.save();
  if (actorId && mongoose.Types.ObjectId.isValid(actorId)) {
    await writeAuditEvent({
      actorUserId: new mongoose.Types.ObjectId(actorId),
      action: "TENANT_RECORD_CREATED",
      entityType: "TENANT",
      entityId: newTenant._id,
      metadata: { email: normalizedEmail, source: parsedData.source },
      diff: { before: null, after: { status: newTenant.status } },
    });
  }
  return newTenant.toObject();
};

export const updateTenant = async (tenantId: string, data: UpdateTenantDTO, actorId?: string) => {
  const updatedTenant = await TenantModel.findByIdAndUpdate(tenantId, { $set: data }, { new: true });
  if (!updatedTenant) throw new AppError("Tenant not found", 404);
  if (actorId && mongoose.Types.ObjectId.isValid(actorId)) {
    await writeAuditEvent({
      actorUserId: new mongoose.Types.ObjectId(actorId),
      action: "TENANT_UPDATED",
      entityType: "TENANT",
      entityId: updatedTenant._id,
      metadata: { keys: Object.keys(data || {}) },
      diff: { after: { keys: Object.keys(data || {}) } },
    });
  }
  return updatedTenant.toObject();
};

export const verifyTenantEmail = async (data: VerifyTenantEmailDTO) => {
  const parsed = VerifyTenantEmailSchema.parse(data);
  const tokenHash = sha256Hex(parsed.token);
  const tenant = await TenantModel.findOne({
    emailVerificationTokenHash: tokenHash,
    emailVerificationExpiresAt: { $gt: new Date() },
  });

  if (!tenant) {
    throw new AppError("Invalid or expired verification token", 400);
  }

  tenant.emailVerifiedAt = new Date();
  tenant.activatedAt = new Date();
  tenant.status = "ACTIVE";
  tenant.emailVerificationTokenHash = undefined;
  tenant.emailVerificationExpiresAt = undefined;

  await tenant.save();
  const userForActor = await User.findOne({ email: tenant.email }).select("_id").lean();
  if (userForActor?._id) {
    await writeAuditEvent({
      actorUserId: userForActor._id,
      action: "TENANT_EMAIL_VERIFIED",
      entityType: "TENANT",
      entityId: tenant._id,
      tenantId: userForActor._id,
      metadata: { email: tenant.email },
      diff: { after: { status: tenant.status } },
    });
  }
  return tenant.toObject();
};
