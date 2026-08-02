import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { writeAuditEvent } from '../../audit/services/audit.service';
import { User } from '../../auth/models/user.model';
import {
  CommunityInterestModel,
  CommunityInterestStatus,
  ICommunityInterest,
} from '../models/community-interest.model';
import { sendCommunityOnboardingInviteEmail } from './community-invite-notifier.service';

const DEFAULT_COMMUNITY_ONBOARDING_URL =
  'https://keypath.ai/onboarding?type=community';
const DEFAULT_INVITE_EXPIRY_HOURS = 24 * 7;
const CURRENT_STEP = 'create_account';
const NEXT_STEP = 'organization_information';

type CommunityAssignedRole = 'COMMUNITY' | 'COMMUNITY_STAKEHOLDER';

interface CreateCommunityInterestInput {
  firstName: string;
  lastName: string;
  email: string;
  organizationName: string;
  stakeholderType: string;
  titleOrRoleAtOrganization: string;
  phoneNumber?: string;
  cityOrRegionServed?: string;
  messageContext?: string;
}

interface GenerateInviteOptions {
  expiresInHours?: number;
  frontendUrl?: string;
  assignedRole?: CommunityAssignedRole;
}

interface CommunityInvitePayload extends jwt.JwtPayload {
  t: 'COMMUNITY_ONBOARDING_INVITE';
  interestId: string;
  inviteId: string;
  email: string;
  assignedRole: CommunityAssignedRole;
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
    process.env.COMMUNITY_ONBOARDING_FRONTEND_URL?.trim() ||
    DEFAULT_COMMUNITY_ONBOARDING_URL;

  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}inviteToken=${encodeURIComponent(token)}`;
}

function parseInviteToken(token: string): CommunityInvitePayload {
  try {
    const decoded = jwt.verify(
      token,
      getInviteSigningSecret()
    ) as CommunityInvitePayload;

    if (
      decoded.t !== 'COMMUNITY_ONBOARDING_INVITE' ||
      !decoded.interestId ||
      !decoded.inviteId ||
      !decoded.email ||
      !decoded.assignedRole
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

function mapInterestSummary(doc: ICommunityInterest) {
  return {
    id: String(doc._id),
    status: doc.status,
    rejectionReason: (doc as any).rejectionReason ?? null,
    firstName: doc.firstName,
    lastName: doc.lastName,
    email: doc.email,
    organizationName: doc.organizationName,
    stakeholderType: doc.stakeholderType,
    titleOrRoleAtOrganization: doc.titleOrRoleAtOrganization,
    phoneNumber: doc.phoneNumber ?? null,
    cityOrRegionServed: doc.cityOrRegionServed ?? null,
    messageContext: doc.messageContext ?? null,
    onboardingInviteIssuedAt: doc.onboardingInviteIssuedAt ?? null,
    onboardingInviteExpiresAt: doc.onboardingInviteExpiresAt ?? null,
    onboardingInviteUsedAt: doc.onboardingInviteUsedAt ?? null,
    onboardedUserId: doc.onboardedUserId ? String(doc.onboardedUserId) : null,
    createdAt: doc.createdAt ?? null,
    updatedAt: doc.updatedAt ?? null,
  };
}

export async function createCommunityInterest(
  input: CreateCommunityInterestInput
) {
  const doc = await CommunityInterestModel.create({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email.toLowerCase(),
    organizationName: input.organizationName,
    stakeholderType: input.stakeholderType,
    titleOrRoleAtOrganization: input.titleOrRoleAtOrganization,
    phoneNumber: input.phoneNumber?.trim() || undefined,
    cityOrRegionServed: input.cityOrRegionServed?.trim() || undefined,
    messageContext: input.messageContext?.trim() || undefined,
    status: 'SUBMITTED' as CommunityInterestStatus,
  });

  await writeAuditEvent({
    action: 'COMMUNITY_INTEREST_SUBMITTED',
    entityType: 'CommunityInterest',
    entityId: doc._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        email: doc.email,
        organizationName: doc.organizationName,
        stakeholderType: doc.stakeholderType,
      },
    },
  });

  return {
    interestId: String(doc._id),
    status: doc.status,
    rejectionReason: (doc as any).rejectionReason ?? null,
  };
}

export async function listCommunityInterests(params: {
  status?: CommunityInterestStatus;
  limit?: number;
}) {
  const query = params.status ? { status: params.status } : {};
  const limit = params.limit ?? 50;

  const docs = await CommunityInterestModel.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .exec();

  return docs.map(mapInterestSummary);
}

export async function generateCommunityOnboardingInviteLink(
  adminUserId: Types.ObjectId,
  interestId: string,
  options: GenerateInviteOptions = {}
) {
  const doc = await CommunityInterestModel.findById(interestId);
  if (!doc) {
    throw new AppError('Community interest request not found', 404);
  }

  if (doc.status === 'ONBOARDED') {
    throw new AppError('Community applicant has already completed onboarding', 409);
  }

  const assignedRole = options.assignedRole ?? 'COMMUNITY_STAKEHOLDER';
  const existingUser = await User.findOne({
    email: doc.email.toLowerCase(),
  })
    .select('role')
    .lean();

  if (existingUser && existingUser.role !== assignedRole) {
    throw new AppError(
      'This email is already registered with a different role and cannot be used for community onboarding',
      409
    );
  }

  const inviteId = randomUUID();
  const expiresInHours = options.expiresInHours ?? DEFAULT_INVITE_EXPIRY_HOURS;
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  const tokenPayload: CommunityInvitePayload = {
    t: 'COMMUNITY_ONBOARDING_INVITE',
    interestId: String(doc._id),
    inviteId,
    email: doc.email,
    assignedRole,
  };

  const token = jwt.sign(tokenPayload, getInviteSigningSecret(), {
    expiresIn: `${expiresInHours}h`,
  });

  const onboardingUrl = buildFrontendOnboardingLink(token, options.frontendUrl);
  const emailDelivery = await sendCommunityOnboardingInviteEmail({
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
    action: 'COMMUNITY_ONBOARDING_INVITE_GENERATED',
    entityType: 'CommunityInterest',
    entityId: doc._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        inviteId,
        assignedRole,
        expiresAt: expiresAt.toISOString(),
        inviteEmailMessageId: emailDelivery.messageId,
      },
    },
  });

  return {
    interestId: String(doc._id),
    status: doc.status,
    rejectionReason: (doc as any).rejectionReason ?? null,
    assignedRole,
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

export async function resolveCommunityInviteToken(token: string) {
  const payload = parseInviteToken(token);

  const doc = await CommunityInterestModel.findById(payload.interestId).exec();
  if (!doc) {
    throw new AppError('Community interest request not found', 404);
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
    assignedRole: payload.assignedRole,
    currentStep: CURRENT_STEP,
    nextStep: NEXT_STEP,
    inviteExpiresAt: doc.onboardingInviteExpiresAt
      ? doc.onboardingInviteExpiresAt.toISOString()
      : null,
    prefill: {
      firstName: doc.firstName,
      lastName: doc.lastName,
      email: doc.email,
      organizationName: doc.organizationName,
      stakeholderType: doc.stakeholderType,
      titleOrRoleAtOrganization: doc.titleOrRoleAtOrganization,
      phoneNumber: doc.phoneNumber ?? null,
      cityOrRegionServed: doc.cityOrRegionServed ?? null,
      messageContext: doc.messageContext ?? null,
    },
    existingAccount: {
      exists: Boolean(existingUser),
      role: existingUser?.role ?? null,
    },
  };
}

export async function assertCommunityRegistrationEligibility(
  token: string,
  email: string,
  role?: string
) {
  const resolved = await resolveCommunityInviteToken(token);
  if (resolved.prefill.email.toLowerCase() !== email.toLowerCase()) {
    throw new AppError(
      'Registration email must match the onboarding invite email',
      400
    );
  }

  if (role && resolved.assignedRole !== role) {
    throw new AppError(
      'Registration role must match the admin-assigned community onboarding role',
      400
    );
  }

  return resolved;
}

export async function consumeCommunityInviteToken(
  token: string,
  onboardedUserId: Types.ObjectId
) {
  const payload = parseInviteToken(token);

  const doc = await CommunityInterestModel.findOneAndUpdate(
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
    action: 'COMMUNITY_ONBOARDING_INVITE_CONSUMED',
    entityType: 'CommunityInterest',
    entityId: doc._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        status: 'ONBOARDED',
      },
    },
  });
}
