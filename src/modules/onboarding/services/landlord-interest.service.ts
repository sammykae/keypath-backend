import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { writeAuditEvent } from '../../audit/services/audit.service';
import { User } from '../../auth/models/user.model';
import {
  ILandlordInterest,
  LandlordInterestModel,
  LandlordInterestStatus,
} from '../models/landlord-interest.model';
import { sendLandlordOnboardingInviteEmail } from './landlord-invite-notifier.service';

const DEFAULT_LANDLORD_ONBOARDING_URL =
  'https://keypath.ai/onboarding?type=landlord';
const DEFAULT_INVITE_EXPIRY_HOURS = 24 * 7;

interface CreateLandlordInterestInput {
  firstName: string;
  lastName: string;
  email: string;
  propertyType: string;
  titleOrRoleAtOrganization: string;
  country: string;
  stateOrProvince: string;
  city: string;
  phoneNumber?: string;
  numberOfUnitsRange?: string;
  messageNotes?: string;
}

interface GenerateInviteOptions {
  expiresInHours?: number;
  frontendUrl?: string;
}

interface InvitePayload extends jwt.JwtPayload {
  t: 'LANDLORD_ONBOARDING_INVITE';
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
    process.env.LANDLORD_ONBOARDING_FRONTEND_URL?.trim() ||
    DEFAULT_LANDLORD_ONBOARDING_URL;

  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}inviteToken=${encodeURIComponent(token)}`;
}

function parseInviteToken(token: string): InvitePayload {
  try {
    const decoded = jwt.verify(token, getInviteSigningSecret()) as InvitePayload;

    if (
      decoded.t !== 'LANDLORD_ONBOARDING_INVITE' ||
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

function mapInterestSummary(doc: ILandlordInterest) {
  return {
    id: String(doc._id),
    status: doc.status,
    rejectionReason: (doc as any).rejectionReason ?? null,
    firstName: doc.firstName,
    lastName: doc.lastName,
    email: doc.email,
    propertyType: doc.propertyType,
    titleOrRoleAtOrganization: doc.titleOrRoleAtOrganization,
    country: doc.country,
    stateOrProvince: doc.stateOrProvince,
    city: doc.city,
    phoneNumber: doc.phoneNumber ?? null,
    numberOfUnitsRange: doc.numberOfUnitsRange ?? null,
    messageNotes: doc.messageNotes ?? null,
    onboardingInviteIssuedAt: doc.onboardingInviteIssuedAt ?? null,
    onboardingInviteExpiresAt: doc.onboardingInviteExpiresAt ?? null,
    onboardingInviteUsedAt: doc.onboardingInviteUsedAt ?? null,
    onboardedUserId: doc.onboardedUserId ? String(doc.onboardedUserId) : null,
    createdAt: doc.createdAt ?? null,
    updatedAt: doc.updatedAt ?? null,
  };
}

export async function createLandlordInterest(input: CreateLandlordInterestInput) {
  const doc = await LandlordInterestModel.create({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email.toLowerCase(),
    propertyType: input.propertyType,
    titleOrRoleAtOrganization: input.titleOrRoleAtOrganization,
    country: input.country,
    stateOrProvince: input.stateOrProvince,
    city: input.city,
    phoneNumber: input.phoneNumber?.trim() || undefined,
    numberOfUnitsRange: input.numberOfUnitsRange?.trim() || undefined,
    messageNotes: input.messageNotes?.trim() || undefined,
    status: 'SUBMITTED' as LandlordInterestStatus,
  });

  await writeAuditEvent({
    action: 'LANDLORD_INTEREST_SUBMITTED',
    entityType: 'LandlordInterest',
    entityId: doc._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        email: doc.email,
        propertyType: doc.propertyType,
      },
    },
  });

  return {
    interestId: String(doc._id),
    status: doc.status,
    rejectionReason: (doc as any).rejectionReason ?? null,
  };
}

export async function listLandlordInterests(params: {
  status?: LandlordInterestStatus;
  limit?: number;
}) {
  const query = params.status ? { status: params.status } : {};
  const limit = params.limit ?? 50;

  const docs = await LandlordInterestModel.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .exec();

  return docs.map(mapInterestSummary);
}

export async function generateLandlordOnboardingInviteLink(
  adminUserId: Types.ObjectId,
  interestId: string,
  options: GenerateInviteOptions = {}
) {
  const doc = await LandlordInterestModel.findById(interestId);
  if (!doc) {
    throw new AppError('Landlord interest request not found', 404);
  }

  if (doc.status === 'ONBOARDED') {
    throw new AppError('Landlord has already completed onboarding', 409);
  }
  const existingUser = await User.findOne({
    email: doc.email.toLowerCase(),
  })
    .select('role')
    .lean();
  if (existingUser && existingUser.role !== 'LANDLORD') {
    throw new AppError(
      'This email is already registered with a different role and cannot be used for landlord onboarding',
      409
    );
  }

  const inviteId = randomUUID();
  const expiresInHours = options.expiresInHours ?? DEFAULT_INVITE_EXPIRY_HOURS;
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  const tokenPayload: InvitePayload = {
    t: 'LANDLORD_ONBOARDING_INVITE',
    interestId: String(doc._id),
    inviteId,
    email: doc.email,
  };

  const token = jwt.sign(tokenPayload, getInviteSigningSecret(), {
    expiresIn: `${expiresInHours}h`,
  });

  const onboardingUrl = buildFrontendOnboardingLink(token, options.frontendUrl);
  const emailDelivery = await sendLandlordOnboardingInviteEmail({
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
  doc.onboardingInviteIssuedByUserId = adminUserId;
  await doc.save();

  await writeAuditEvent({
    actorUserId: adminUserId,
    action: 'LANDLORD_ONBOARDING_INVITE_GENERATED',
    entityType: 'LandlordInterest',
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

export async function resolveLandlordInviteToken(token: string) {
  const payload = parseInviteToken(token);

  const doc = await LandlordInterestModel.findById(payload.interestId).exec();
  if (!doc) {
    throw new AppError('Landlord interest request not found', 404);
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
    inviteExpiresAt: doc.onboardingInviteExpiresAt
      ? doc.onboardingInviteExpiresAt.toISOString()
      : null,
    prefill: {
      firstName: doc.firstName,
      lastName: doc.lastName,
      email: doc.email,
      propertyType: doc.propertyType,
      titleOrRoleAtOrganization: doc.titleOrRoleAtOrganization,
      country: doc.country,
      stateOrProvince: doc.stateOrProvince,
      city: doc.city,
      phoneNumber: doc.phoneNumber ?? null,
      numberOfUnitsRange: doc.numberOfUnitsRange ?? null,
      messageNotes: doc.messageNotes ?? null,
    },
    existingAccount: {
      exists: Boolean(existingUser),
      role: existingUser?.role ?? null,
    },
  };
}

export async function assertLandlordRegistrationEligibility(
  token: string,
  email: string
) {
  const resolved = await resolveLandlordInviteToken(token);
  if (resolved.prefill.email.toLowerCase() !== email.toLowerCase()) {
    throw new AppError('Registration email must match the onboarding invite email', 400);
  }

  return resolved;
}

export async function consumeLandlordInviteToken(
  token: string,
  onboardedUserId: Types.ObjectId
) {
  const payload = parseInviteToken(token);

  const doc = await LandlordInterestModel.findOneAndUpdate(
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
    throw new AppError('Invite token has already been consumed or is no longer valid', 409);
  }

  await writeAuditEvent({
    actorUserId: onboardedUserId,
    action: 'LANDLORD_ONBOARDING_INVITE_CONSUMED',
    entityType: 'LandlordInterest',
    entityId: doc._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        status: 'ONBOARDED',
      },
    },
  });
}
