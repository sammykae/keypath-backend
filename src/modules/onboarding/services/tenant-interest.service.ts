import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { writeAuditEvent } from '../../audit/services/audit.service';
import { User } from '../../auth/models/user.model';
import {
  ITenantInterest,
  TenantInterestModel,
  TenantInterestStatus,
} from '../models/tenant-interest.model';
import { sendTenantOnboardingInviteEmail } from './tenant-invite-notifier.service';

const DEFAULT_TENANT_ONBOARDING_URL =
  'https://keypath.ai/onboarding';
const DEFAULT_INVITE_EXPIRY_HOURS = 24 * 7;
const CURRENT_STEP = 'create_account';
const NEXT_STEP = 'identity_verification';

interface CreateTenantInterestInput {
  firstName: string;
  lastName: string;
  email: string;
  country: string;
  stateOrProvince: string;
  city: string;
  currentHousingType: string;
  propertyAddress: string;
  propertyCountry: string;
  propertyStateOrProvince: string;
  propertyCity: string;
  phoneNumber?: string;
  landlordOrPropertyManagerName?: string;
  message?: string;
}

interface GenerateInviteOptions {
  expiresInHours?: number;
  frontendUrl?: string;
}

interface TenantInvitePayload extends jwt.JwtPayload {
  t: 'TENANT_ONBOARDING_INVITE';
  interestId: string;
  inviteId: string;
  email: string;
}

function getInviteSigningSecret(): string {
  const secret = process.env.ONBOARDING_INVITE_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new AppError('Invite signing secret is not configured', 500);
  }
  return secret;
}

function buildFrontendOnboardingLink(token: string, customUrl?: string): string {
  const baseUrl =
    customUrl?.trim() ||
    process.env.TENANT_ONBOARDING_FRONTEND_URL?.trim() ||
    DEFAULT_TENANT_ONBOARDING_URL;

  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}inviteToken=${encodeURIComponent(token)}`;
}

function parseInviteToken(token: string): TenantInvitePayload {
  try {
    const decoded = jwt.verify(token, getInviteSigningSecret()) as TenantInvitePayload;

    if (
      decoded.t !== 'TENANT_ONBOARDING_INVITE' ||
      !decoded.interestId ||
      !decoded.inviteId ||
      !decoded.email
    ) {
      throw new AppError('Invalid onboarding invite token', 401);
    }

    return decoded;
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }

    throw new AppError('Invalid or expired onboarding invite token', 401);
  }
}

function mapInterestSummary(doc: ITenantInterest) {
  return {
    id: String(doc._id),
    status: doc.status,
    rejectionReason: (doc as any).rejectionReason ?? null,
    firstName: doc.firstName,
    lastName: doc.lastName,
    email: doc.email,
    country: doc.country,
    stateOrProvince: doc.stateOrProvince,
    city: doc.city,
    currentHousingType: doc.currentHousingType,
    propertyAddress: doc.propertyAddress,
    propertyCountry: doc.propertyCountry,
    propertyStateOrProvince: doc.propertyStateOrProvince,
    propertyCity: doc.propertyCity,
    phoneNumber: doc.phoneNumber ?? null,
    landlordOrPropertyManagerName: doc.landlordOrPropertyManagerName ?? null,
    message: doc.message ?? null,
    onboardingInviteIssuedAt: doc.onboardingInviteIssuedAt ?? null,
    onboardingInviteExpiresAt: doc.onboardingInviteExpiresAt ?? null,
    onboardingInviteUsedAt: doc.onboardingInviteUsedAt ?? null,
    onboardedUserId: doc.onboardedUserId ? String(doc.onboardedUserId) : null,
    createdAt: doc.createdAt ?? null,
    updatedAt: doc.updatedAt ?? null,
  };
}

export async function createTenantInterest(input: CreateTenantInterestInput) {
  const doc = await TenantInterestModel.create({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email.toLowerCase(),
    country: input.country,
    stateOrProvince: input.stateOrProvince,
    city: input.city,
    currentHousingType: input.currentHousingType,
    propertyAddress: input.propertyAddress,
    propertyCountry: input.propertyCountry,
    propertyStateOrProvince: input.propertyStateOrProvince,
    propertyCity: input.propertyCity,
    phoneNumber: input.phoneNumber?.trim() || undefined,
    landlordOrPropertyManagerName:
      input.landlordOrPropertyManagerName?.trim() || undefined,
    message: input.message?.trim() || undefined,
    status: 'SUBMITTED' as TenantInterestStatus,
  });

  await writeAuditEvent({
    action: 'TENANT_INTEREST_SUBMITTED',
    entityType: 'TenantInterest',
    entityId: doc._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        email: doc.email,
        currentHousingType: doc.currentHousingType,
      },
    },
  });

  return {
    interestId: String(doc._id),
    status: doc.status,
    rejectionReason: (doc as any).rejectionReason ?? null,
  };
}

export async function listTenantInterests(params: {
  status?: TenantInterestStatus;
  limit?: number;
}) {
  const query = params.status ? { status: params.status } : {};
  const limit = params.limit ?? 50;

  const docs = await TenantInterestModel.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .exec();

  return docs.map(mapInterestSummary);
}

export async function generateTenantOnboardingInviteLink(
  issuingUserId: Types.ObjectId,
  interestId: string,
  options: GenerateInviteOptions = {}
) {
  const doc = await TenantInterestModel.findById(interestId);
  if (!doc) {
    throw new AppError('Tenant interest request not found', 404);
  }

  if (doc.status === 'ONBOARDED') {
    throw new AppError('Tenant has already completed onboarding', 409);
  }

  const existingUser = await User.findOne({
    email: doc.email.toLowerCase(),
  })
    .select('role')
    .lean();
  if (existingUser && existingUser.role !== 'TENANT') {
    throw new AppError(
      'This email is already registered with a different role and cannot be used for tenant onboarding',
      409
    );
  }

  const inviteId = randomUUID();
  const expiresInHours = options.expiresInHours ?? DEFAULT_INVITE_EXPIRY_HOURS;
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  const tokenPayload: TenantInvitePayload = {
    t: 'TENANT_ONBOARDING_INVITE',
    interestId: String(doc._id),
    inviteId,
    email: doc.email,
  };

  const token = jwt.sign(tokenPayload, getInviteSigningSecret(), {
    expiresIn: `${expiresInHours}h`,
  });

  const onboardingUrl = buildFrontendOnboardingLink(token, options.frontendUrl);
  const emailDelivery = await sendTenantOnboardingInviteEmail({
    toEmail: doc.email,
    firstName: doc.firstName,
    onboardingUrl,
    expiresAtIso: expiresAt.toISOString(),
  });

  doc.status = 'INVITE_GENERATED';
  doc.onboardingInviteId = inviteId;
  doc.onboardingInviteIssuedAt = new Date();
  doc.onboardingInviteExpiresAt = expiresAt;
  doc.onboardingInviteUsedAt = null;
  doc.onboardingInviteIssuedByUserId = issuingUserId;
  await doc.save();

  await writeAuditEvent({
    actorUserId: issuingUserId,
    action: 'TENANT_ONBOARDING_INVITE_GENERATED',
    entityType: 'TenantInterest',
    entityId: doc._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        inviteId,
        expiresAt: expiresAt.toISOString(),
        inviteEmailMessageId: emailDelivery.messageId,
      },
    },
  });

  return {
    interestId: String(doc._id),
    status: doc.status,
    rejectionReason: (doc as any).rejectionReason ?? null,
    onboardingUrl,
    token,
    expiresAt: expiresAt.toISOString(),
    inviteEmail: {
      sent: true,
      recipient: doc.email,
      messageId: emailDelivery.messageId,
    },
  };
}

export async function resolveTenantInviteToken(token: string) {
  const payload = parseInviteToken(token);

  const doc = await TenantInterestModel.findById(payload.interestId).exec();
  if (!doc) {
    throw new AppError('Tenant interest request not found', 404);
  }

  if (!doc.onboardingInviteId || doc.onboardingInviteId !== payload.inviteId) {
    throw new AppError('Onboarding invite token is no longer valid', 401);
  }

  if (doc.status === 'ONBOARDED' || doc.onboardingInviteUsedAt) {
    throw new AppError('Onboarding invite token has already been used', 409);
  }

  if (doc.onboardingInviteExpiresAt && doc.onboardingInviteExpiresAt < new Date()) {
    throw new AppError('Onboarding invite token has expired', 401);
  }

  const existingUser = await User.findOne({
    email: doc.email.toLowerCase(),
  })
    .select('role')
    .lean();

  return {
    interestId: String(doc._id),
    status: doc.status,
    rejectionReason: (doc as any).rejectionReason ?? null,
    assignedRole: 'TENANT' as const,
    currentStep: CURRENT_STEP,
    nextStep: NEXT_STEP,
    inviteExpiresAt: doc.onboardingInviteExpiresAt
      ? doc.onboardingInviteExpiresAt.toISOString()
      : null,
    prefill: {
      firstName: doc.firstName,
      lastName: doc.lastName,
      email: doc.email,
      country: doc.country,
      stateOrProvince: doc.stateOrProvince,
      city: doc.city,
      currentHousingType: doc.currentHousingType,
      propertyAddress: doc.propertyAddress,
      propertyCountry: doc.propertyCountry,
      propertyStateOrProvince: doc.propertyStateOrProvince,
      propertyCity: doc.propertyCity,
      phoneNumber: doc.phoneNumber ?? null,
      landlordOrPropertyManagerName: doc.landlordOrPropertyManagerName ?? null,
      message: doc.message ?? null,
    },
    existingAccount: {
      exists: Boolean(existingUser),
      role: existingUser?.role ?? null,
    },
  };
}

export async function assertTenantRegistrationEligibility(
  token: string,
  email: string
) {
  const resolved = await resolveTenantInviteToken(token);
  if (resolved.prefill.email.toLowerCase() !== email.toLowerCase()) {
    throw new AppError(
      'Registration email must match the onboarding invite email',
      400
    );
  }

  return resolved;
}

export async function consumeTenantInviteToken(
  token: string,
  onboardedUserId: Types.ObjectId
) {
  const payload = parseInviteToken(token);

  const doc = await TenantInterestModel.findOneAndUpdate(
    {
      _id: payload.interestId,
      onboardingInviteId: payload.inviteId,
      status: { $ne: 'ONBOARDED' },
      $or: [{ onboardedUserId: null }, { onboardedUserId: { $exists: false } }],
    },
    {
      $set: {
        status: 'ONBOARDED',
        onboardedUserId,
        onboardingInviteUsedAt: new Date(),
      },
    },
    { new: true }
  ).exec();

  if (!doc) {
    throw new AppError(
      'Invite token has already been consumed or is no longer valid',
      409
    );
  }

  await writeAuditEvent({
    actorUserId: onboardedUserId,
    action: 'TENANT_ONBOARDING_INVITE_CONSUMED',
    entityType: 'TenantInterest',
    entityId: doc._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        status: 'ONBOARDED',
      },
    },
  });
}
