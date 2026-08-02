import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { writeAuditEvent } from '../../audit/services/audit.service';
import { User } from '../../auth/models/user.model';
import {
  IInvestorInterest,
  InvestorInterestModel,
  InvestorInterestStatus,
} from '../models/investor-interest.model';
import { sendInvestorOnboardingInviteEmail } from './investor-invite-notifier.service';

const DEFAULT_INVESTOR_ONBOARDING_URL =
  'https://keypath.ai/onboarding?type=investor';
const DEFAULT_INVITE_EXPIRY_HOURS = 24 * 7;
const CURRENT_STEP = 'create_account';
const NEXT_STEP = 'investor_status_acknowledgment';

interface CreateInvestorInterestInput {
  firstName: string;
  lastName: string;
  email: string;
  investorType: string;
  phoneNumber?: string;
  typicalCheckSize?: string;
  linkedinUrl?: string;
  message?: string;
}

interface GenerateInviteOptions {
  expiresInHours?: number;
  frontendUrl?: string;
}

interface InvestorInvitePayload extends jwt.JwtPayload {
  t: 'INVESTOR_ONBOARDING_INVITE';
  interestId: string;
  inviteId: string;
  email: string;
  assignedRole: 'INVESTOR';
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
    process.env.INVESTOR_ONBOARDING_FRONTEND_URL?.trim() ||
    DEFAULT_INVESTOR_ONBOARDING_URL;

  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}inviteToken=${encodeURIComponent(token)}`;
}

function parseInviteToken(token: string): InvestorInvitePayload {
  try {
    const decoded = jwt.verify(
      token,
      getInviteSigningSecret()
    ) as InvestorInvitePayload;

    if (
      decoded.t !== 'INVESTOR_ONBOARDING_INVITE' ||
      !decoded.interestId ||
      !decoded.inviteId ||
      !decoded.email ||
      decoded.assignedRole !== 'INVESTOR'
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

function mapInterestSummary(doc: IInvestorInterest) {
  return {
    id: String(doc._id),
    status: doc.status,
    rejectionReason: (doc as any).rejectionReason ?? null,
    firstName: doc.firstName,
    lastName: doc.lastName,
    email: doc.email,
    investorType: doc.investorType,
    phoneNumber: doc.phoneNumber ?? null,
    typicalCheckSize: doc.typicalCheckSize ?? null,
    linkedinUrl: doc.linkedinUrl ?? null,
    message: doc.message ?? null,
    onboardingInviteIssuedAt: doc.onboardingInviteIssuedAt ?? null,
    onboardingInviteExpiresAt: doc.onboardingInviteExpiresAt ?? null,
    onboardingInviteUsedAt: doc.onboardingInviteUsedAt ?? null,
    onboardedUserId: doc.onboardedUserId ? String(doc.onboardedUserId) : null,
    createdAt: doc.createdAt ?? null,
    updatedAt: doc.updatedAt ?? null,
  };
}

export async function createInvestorInterest(
  input: CreateInvestorInterestInput
) {
  const doc = await InvestorInterestModel.create({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email.toLowerCase(),
    investorType: input.investorType,
    phoneNumber: input.phoneNumber?.trim() || undefined,
    typicalCheckSize: input.typicalCheckSize?.trim() || undefined,
    linkedinUrl: input.linkedinUrl?.trim() || undefined,
    message: input.message?.trim() || undefined,
    status: 'SUBMITTED' as InvestorInterestStatus,
  });

  await writeAuditEvent({
    action: 'INVESTOR_INTEREST_SUBMITTED',
    entityType: 'InvestorInterest',
    entityId: doc._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        email: doc.email,
        investorType: doc.investorType,
        typicalCheckSize: doc.typicalCheckSize ?? null,
      },
    },
  });

  return {
    interestId: String(doc._id),
    status: doc.status,
    rejectionReason: (doc as any).rejectionReason ?? null,
  };
}

export async function listInvestorInterests(params: {
  status?: InvestorInterestStatus;
  limit?: number;
}) {
  const query = params.status ? { status: params.status } : {};
  const limit = params.limit ?? 50;

  const docs = await InvestorInterestModel.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .exec();

  return docs.map(mapInterestSummary);
}

export async function generateInvestorOnboardingInviteLink(
  adminUserId: Types.ObjectId,
  interestId: string,
  options: GenerateInviteOptions = {}
) {
  const doc = await InvestorInterestModel.findById(interestId);
  if (!doc) {
    throw new AppError('Investor interest request not found', 404);
  }

  if (doc.status === 'ONBOARDED') {
    throw new AppError('Investor applicant has already completed onboarding', 409);
  }

  const existingUser = await User.findOne({
    email: doc.email.toLowerCase(),
  })
    .select('role')
    .lean();

  if (existingUser && existingUser.role !== 'INVESTOR') {
    throw new AppError(
      'This email is already registered with a different role and cannot be used for investor onboarding',
      409
    );
  }

  const inviteId = randomUUID();
  const expiresInHours = options.expiresInHours ?? DEFAULT_INVITE_EXPIRY_HOURS;
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  const tokenPayload: InvestorInvitePayload = {
    t: 'INVESTOR_ONBOARDING_INVITE',
    interestId: String(doc._id),
    inviteId,
    email: doc.email,
    assignedRole: 'INVESTOR',
  };

  const token = jwt.sign(tokenPayload, getInviteSigningSecret(), {
    expiresIn: `${expiresInHours}h`,
  });

  const onboardingUrl = buildFrontendOnboardingLink(token, options.frontendUrl);
  const emailDelivery = await sendInvestorOnboardingInviteEmail({
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
    action: 'INVESTOR_ONBOARDING_INVITE_GENERATED',
    entityType: 'InvestorInterest',
    entityId: doc._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        inviteId,
        assignedRole: 'INVESTOR',
        expiresAt: expiresAt.toISOString(),
        inviteEmailMessageId: emailDelivery.messageId,
      },
    },
  });

  return {
    interestId: String(doc._id),
    status: doc.status,
    rejectionReason: (doc as any).rejectionReason ?? null,
    assignedRole: 'INVESTOR' as const,
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

export async function resolveInvestorInviteToken(token: string) {
  const payload = parseInviteToken(token);

  const doc = await InvestorInterestModel.findById(payload.interestId).exec();
  if (!doc) {
    throw new AppError('Investor interest request not found', 404);
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
      investorType: doc.investorType,
      phoneNumber: doc.phoneNumber ?? null,
      typicalCheckSize: doc.typicalCheckSize ?? null,
      linkedinUrl: doc.linkedinUrl ?? null,
      message: doc.message ?? null,
    },
    existingAccount: {
      exists: Boolean(existingUser),
      role: existingUser?.role ?? null,
    },
  };
}

export async function assertInvestorRegistrationEligibility(
  token: string,
  email: string,
  role?: string
) {
  const resolved = await resolveInvestorInviteToken(token);
  if (resolved.prefill.email.toLowerCase() !== email.toLowerCase()) {
    throw new AppError(
      'Registration email must match the onboarding invite email',
      400
    );
  }

  if (role && resolved.assignedRole !== role) {
    throw new AppError(
      'Registration role must match the admin-assigned investor onboarding role',
      400
    );
  }

  return resolved;
}

export async function consumeInvestorInviteToken(
  token: string,
  onboardedUserId: Types.ObjectId
) {
  const payload = parseInviteToken(token);

  const doc = await InvestorInterestModel.findOneAndUpdate(
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
    action: 'INVESTOR_ONBOARDING_INVITE_CONSUMED',
    entityType: 'InvestorInterest',
    entityId: doc._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        status: 'ONBOARDED',
      },
    },
  });
}
