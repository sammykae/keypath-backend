import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { generateJwt } from '../../../core/config/passport';
import { writeAuditEvent } from '../../audit/services/audit.service';
import { User } from '../../auth/models/user.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { getTenantProperty } from '../../tenant/services/tenantProperty.service';
import { TepaEnrollment } from '../../tepa/models/tepa-enrollment.model';
import { UnitModel } from '../../units/models/unit.model';
import { OnboardingState } from '../models/onboarding-state.model';
import { evaluateOnboarding } from './onboarding.service';
import {
  assertTenantRegistrationEligibility,
  consumeTenantInviteToken,
} from './tenant-interest.service';
import { issueOtpForUser, verifyUserOtp } from '../../../core/email/email-otp.service';

export { verifyUserOtp as verifyTenantOtp };

const CREATE_ACCOUNT_STEP = 'create_account';
const IDENTITY_VERIFICATION_STEP = 'identity_verification';
const LEASE_ASSOCIATION_STEP = 'lease_association';
const PROGRAM_EXPLANATION_STEP = 'program_explanation';
const PARTICIPATION_STATUS_STEP = 'participation_status';
const DASHBOARD_WALKTHROUGH_STEP = 'dashboard_walkthrough';

function ensureTenant(user: any) {
  if (!user) {
    throw new AppError('Authentication required', 401);
  }

  if (user.role !== 'TENANT') {
    throw new AppError('Tenant only endpoint', 403);
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeDateOfBirth(value: unknown): string {
  if (!isNonEmptyString(value)) {
    throw new AppError('dateOfBirth is required', 400);
  }

  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const usDateMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (usDateMatch) {
    const [, month, day, year] = usDateMatch;
    return `${year}-${month}-${day}`;
  }

  throw new AppError(
    'dateOfBirth must be in YYYY-MM-DD or MM/DD/YYYY format',
    400
  );
}

function normalizePropertyCode(value: unknown): string {
  if (!isNonEmptyString(value)) {
    throw new AppError('propertyCode is required', 400);
  }

  return value.trim().toUpperCase();
}

function buildPropertyCode(propertyId: unknown): string {
  const raw = String(propertyId ?? '')
    .replace(/[^a-fA-F0-9]/g, '')
    .slice(-8);

  const numeric = Number.parseInt(raw || '0', 16)
    .toString()
    .padStart(8, '0');

  return `KP-${numeric.slice(-5)}`;
}

function getStepData<T = Record<string, unknown>>(
  state: any,
  stepKey: string
): T | null {
  const stepData = (state?.stepData ?? {}) as Record<string, unknown>;
  return (stepData[stepKey] as T | undefined) ?? null;
}

function buildLeaseAssociationFromActiveProperty(activeProperty: any) {
  if (!activeProperty) {
    return null;
  }

  return {
    associationMethod: 'ACTIVE_TENANCY',
    propertyId: String(activeProperty.property._id),
    propertyCode: buildPropertyCode(activeProperty.property._id),
    propertyName: activeProperty.property.name,
    propertyAddress: activeProperty.property.address.line1,
    propertyCity: activeProperty.property.address.city,
    propertyState: activeProperty.property.address.state,
    propertyCountry: activeProperty.property.address.country,
    unitId: String(activeProperty.unit._id),
    unitNumber: activeProperty.unit.unitNumber,
    unitStatus: activeProperty.unit.status,
  };
}

async function getActiveTenantProperty(user: any) {
  try {
    return await getTenantProperty(String(user._id));
  } catch {
    return null;
  }
}

async function ensureTenantStepReady(user: any, requiredStep: string) {
  ensureTenant(user);

  const state = await OnboardingState.findOne({ userId: user._id }).exec();
  if (state?.completedSteps?.includes(requiredStep)) {
    return state;
  }

  if (requiredStep === LEASE_ASSOCIATION_STEP) {
    const activeProperty = await getActiveTenantProperty(user);
    if (activeProperty && state) {
      return state;
    }
  }

  throw new AppError(
    `${requiredStep.replace(/_/g, ' ')} step is required before continuing`,
    400
  );
}

async function findPropertyByCode(propertyCode: string) {
  const rawCode = propertyCode.trim();
  const normalizedCode = normalizePropertyCode(propertyCode);

  if (Types.ObjectId.isValid(rawCode)) {
    const propertyById = await PropertyModel.findById(rawCode).lean().exec();
    if (propertyById) {
      return propertyById;
    }
  }

  const propertyBySlug = await PropertyModel.findOne({
    slug: rawCode.toLowerCase(),
  })
    .lean()
    .exec();
  if (propertyBySlug) {
    return propertyBySlug;
  }

  const properties = await PropertyModel.find({})
    .select('_id name slug address status')
    .lean()
    .exec();

  return (
    properties.find(
      (property) => buildPropertyCode(property._id) === normalizedCode
    ) ?? null
  );
}

async function buildLeaseAssociationLookup(propertyCode: string) {
  const property = await findPropertyByCode(propertyCode);
  if (!property) {
    throw new AppError('Property not found for the provided property code', 404);
  }

  const units = await UnitModel.find({ propertyId: property._id })
    .sort({ unitNumber: 1 })
    .lean()
    .exec();

  return {
    property: {
      id: String(property._id),
      propertyCode: buildPropertyCode(property._id),
      name: property.name,
      address: property.address?.line1 ?? null,
      city: property.address?.city ?? null,
      state: property.address?.state ?? null,
      country: property.address?.country ?? null,
      status: property.status,
    },
    units: units.map((unit) => ({
      id: String(unit._id),
      unitNumber: unit.unitNumber,
      status: unit.status,
      bedrooms: unit.bedrooms,
      bathrooms: unit.bathrooms,
      rent: unit.rent,
    })),
  };
}

async function getLeaseAssociationPayload(user: any, state: any) {
  const savedPayload = getStepData<Record<string, unknown>>(
    state,
    LEASE_ASSOCIATION_STEP
  );

  if (savedPayload) {
    return savedPayload;
  }

  const activeProperty = await getActiveTenantProperty(user);
  return buildLeaseAssociationFromActiveProperty(activeProperty);
}

function buildProgramExplanationContent(leaseAssociation: any) {
  return {
    property: {
      propertyId: leaseAssociation?.propertyId ?? null,
      propertyName: leaseAssociation?.propertyName ?? null,
      unitNumber: leaseAssociation?.unitNumber ?? null,
    },
    cards: [
      {
        key: 'how_tokens_work',
        title: 'How Tokens Work',
        body:
          'Tokens reflect your economic participation in the property, linked to your rent activity over time. As you make on-time payments, your participation grows.',
        footer: 'Tokens track value and are not tradable assets.',
      },
      {
        key: 'what_tepa_is',
        title: 'What TEPA Is',
        body:
          'TEPA (Tenant Economic Participation Agreement) is a structured program designed to help tenants build long-term economic value while renting.',
        footer: 'Participation grows gradually, based on program rules.',
      },
      {
        key: 'what_this_is_not',
        title: 'What This Is NOT',
        bullets: [
          'Property ownership',
          'Legal deed or title',
          'Mortgage or loan',
        ],
        footer:
          'This program does not give legal ownership rights, property title, or borrowing obligations.',
      },
    ],
    acknowledgementText:
      'I understand this program does not grant ownership, title, or property rights.',
    participationNote:
      'Participation in Tenant Economic Participation (TEPA) is optional and governed by a separate agreement.',
    exitAndParticipationRules: [
      'Participation is governed by the TEPA agreement and property rules.',
      'Leaving the property or ending the lease may affect participation eligibility.',
      'Program benefits do not transfer deed, title, mortgage, or legal ownership rights.',
    ],
  };
}

async function buildParticipationStatusContent(user: any, leaseAssociation: any) {
  const unitId =
    typeof leaseAssociation?.unitId === 'string' ? leaseAssociation.unitId : null;

  const tepaEnrollment =
    unitId && Types.ObjectId.isValid(unitId)
      ? await TepaEnrollment.findOne({
          tenantUserId: user._id,
          unitId: new Types.ObjectId(unitId),
          status: 'ACTIVE',
        })
          .lean()
          .exec()
      : null;

  const rewardsProgram = {
    status: 'NOT_APPLICABLE',
    label: 'Not applicable',
    title: 'Rewards Program',
    description:
      'This property participates in TEPA only. Rewards program is not offered here.',
  };

  const tepaProgram = tepaEnrollment
    ? {
        status: 'ACTIVE',
        label: 'Active',
        title: 'Tenant Economic Participation (TEPA)',
        description:
          'Your landlord has enabled TEPA for this property. Your economic participation is tracked according to the TEPA agreement you accepted.',
        effectiveDate: tepaEnrollment.effectiveDate.toISOString(),
        consentVersion: tepaEnrollment.consentVersion,
      }
    : {
        status: 'INACTIVE',
        label: 'Inactive',
        title: 'Tenant Economic Participation (TEPA)',
        description:
          'TEPA is not active for this lease yet. Contact your property manager if you expect TEPA access.',
        effectiveDate: null,
        consentVersion: null,
      };

  return {
    property: {
      propertyId: leaseAssociation?.propertyId ?? null,
      propertyName: leaseAssociation?.propertyName ?? null,
      unitId: leaseAssociation?.unitId ?? null,
      unitNumber: leaseAssociation?.unitNumber ?? null,
    },
    rewardsProgram,
    tepaProgram,
  };
}

function buildDashboardWalkthroughContent(
  leaseAssociation: any,
  participationStatus: any
) {
  const tepaIsActive = participationStatus?.tepaProgram?.status === 'ACTIVE';

  return {
    cards: [
      {
        key: 'my_property',
        title: 'My Property',
        description:
          'View your home details, unit information, and property updates all in one place. Details populate after onboarding is complete.',
        highlight: leaseAssociation?.propertyName
          ? `${leaseAssociation.propertyName}${leaseAssociation.unitNumber ? ` • Unit ${leaseAssociation.unitNumber}` : ''}`
          : null,
      },
      {
        key: 'rewards_participation',
        title: 'Rewards Participation',
        description:
          'Earn rewards for positive tenancy behaviors like paying rent on time and maintaining good standing. Rewards may include perks, discounts, or community benefits depending on your property’s program.',
        footer:
          'Rewards do not grant ownership, equity, or property rights.',
      },
      {
        key: 'participation_overview',
        title: 'Participation Overview',
        description:
          'Track your participation status based on your lease and program eligibility. Availability depends on whether your landlord has enabled economic participation for this property.',
        footer: tepaIsActive
          ? 'Participation may include rewards only or rewards plus tracked economic participation.'
          : 'Participation availability is based on your property’s current program configuration.',
      },
      {
        key: 'payments',
        title: 'Payments',
        description:
          'See your rent history, upcoming payments, and how on-time payments support your participation status once your account is fully active.',
      },
    ],
    aiInsightsPreview:
      'Participation trends suggest higher engagement in properties with rewards enabled.',
    confirmationText:
      'I confirm my information is accurate and understand that participation does not grant ownership, title, or deed rights.',
    redirectTo: '/dashboard',
  };
}

export interface CreateTenantAccountInput {
  onboardingToken?: string;
  email: string;
  password: string;
  phone?: string;
}

export interface TenantIdentityVerificationInput {
  fullName?: string;
  legalFullName?: string;
  dateOfBirth?: string;
  dob?: string;
  phoneNumber?: string;
  phone?: string;
  acceptedTermsAndPrivacyPolicy?: boolean;
  acceptedTerms?: boolean;
  acceptedTermsOfUse?: boolean;
  acceptedPrivacyPolicy?: boolean;
}

export interface TenantLeaseAssociationLookupInput {
  propertyCode: string;
}

export interface TenantLeaseAssociationInput {
  propertyCode: string;
  unitId: string;
}

export interface TenantProgramExplanationInput {
  acknowledgedNoOwnership?: boolean;
  acknowledgement?: boolean;
}

export interface TenantDashboardWalkthroughInput {
  confirmedAccurateAndNoOwnershipRights?: boolean;
  acknowledgedFinalTerms?: boolean;
}

export async function createTenantAccountFromInvite(
  input: CreateTenantAccountInput
) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const existing = await User.findOne({ email: normalizedEmail }).lean().exec();
  if (existing) {
    throw new AppError('Email already registered', 409);
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  let profileOverride: { firstName?: string; lastName?: string; address?: string } = {};
  let createAccountData: Record<string, unknown> = { email: normalizedEmail };

  if (input.onboardingToken) {
    const invite = await assertTenantRegistrationEligibility(
      input.onboardingToken,
      normalizedEmail
    );
    profileOverride = {
      firstName: invite.prefill.firstName,
      lastName: invite.prefill.lastName,
      address: invite.prefill.propertyAddress,
    };
    createAccountData.interestId = invite.interestId;
  }

  const user = await User.create({
    email: normalizedEmail,
    phone: input.phone?.trim() || undefined,
    passwordHash,
    role: 'TENANT',
    status: 'PENDING',
    oauthProviders: [],
    profile: profileOverride,
  });

  if (input.onboardingToken) {
    try {
      await consumeTenantInviteToken(
        input.onboardingToken,
        user._id as Types.ObjectId
      );
    } catch (consumeErr) {
      await User.deleteOne({ _id: user._id }).catch(() => undefined);
      throw consumeErr;
    }
  }

  await OnboardingState.findOneAndUpdate(
    { userId: user._id },
    {
      role: user.role,
      $set: {
        [`stepData.${CREATE_ACCOUNT_STEP}`]: createAccountData,
        updatedAt: new Date(),
      },
      $addToSet: { completedSteps: CREATE_ACCOUNT_STEP },
      status: 'IN_PROGRESS',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await writeAuditEvent({
    actorUserId: user._id as Types.ObjectId,
    action: 'TENANT_ONBOARDING_ACCOUNT_CREATED',
    entityType: 'User',
    entityId: user._id as Types.ObjectId,
    diff: {
      before: null,
      after: createAccountData,
    },
  });

  await issueOtpForUser(user._id as Types.ObjectId, user.email, user.profile?.firstName ?? '');

  const token = generateJwt(user);
  const onboarding = await evaluateOnboarding(user);

  return {
    token,
    user: {
      id: String(user._id),
      email: user.email,
      role: user.role,
      status: user.status,
      profile: user.profile ?? null,
    },
    stepKey: CREATE_ACCOUNT_STEP,
    completed: true,
    nextStep: 'verify_email',
    onboardingStatus: onboarding.status,
    onboarding,
  };
}

export async function saveTenantIdentityVerification(
  user: any,
  input: TenantIdentityVerificationInput
) {
  const state = await ensureTenantStepReady(user, CREATE_ACCOUNT_STEP);

  const fullName = (input.fullName ?? input.legalFullName ?? '').trim();
  if (!fullName) {
    throw new AppError('fullName is required', 400);
  }

  const phoneNumber = (input.phoneNumber ?? input.phone ?? '').trim();
  if (!phoneNumber) {
    throw new AppError('phoneNumber is required', 400);
  }

  const acceptedTermsAndPrivacyPolicy =
    input.acceptedTermsAndPrivacyPolicy === true ||
    input.acceptedTerms === true ||
    (input.acceptedTermsOfUse === true &&
      input.acceptedPrivacyPolicy === true);

  if (!acceptedTermsAndPrivacyPolicy) {
    throw new AppError(
      'You must accept the Terms of Use and Privacy Policy to continue',
      400
    );
  }

  const payload = {
    fullName,
    dateOfBirth: normalizeDateOfBirth(input.dateOfBirth ?? input.dob),
    phoneNumber,
    acceptedTermsAndPrivacyPolicy: true,
    verificationMethod: 'SELF_ATTESTED',
    verifiedAt: new Date().toISOString(),
  };

  state.role = user.role;
  state.stepData = {
    ...(state.stepData ?? {}),
    [IDENTITY_VERIFICATION_STEP]: payload,
  };

  if (!state.completedSteps.includes(IDENTITY_VERIFICATION_STEP)) {
    state.completedSteps.push(IDENTITY_VERIFICATION_STEP);
  }

  state.status = 'IN_PROGRESS';
  state.updatedAt = new Date();
  await state.save();

  const updatedUser = await User.findByIdAndUpdate(
    user._id,
    {
      $set: {
        phone: phoneNumber,
      },
    },
    { new: true }
  ).lean();

  await writeAuditEvent({
    actorUserId: user._id as Types.ObjectId,
    action: 'TENANT_IDENTITY_VERIFICATION_SUBMITTED',
    entityType: 'OnboardingState',
    entityId: user._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        stepKey: IDENTITY_VERIFICATION_STEP,
        fullName,
        dateOfBirth: payload.dateOfBirth,
      },
    },
  });

  const onboarding = await evaluateOnboarding(updatedUser ?? user);

  return {
    message: 'Identity verification saved successfully',
    stepKey: IDENTITY_VERIFICATION_STEP,
    identityVerification: payload,
    completed: true,
    nextStep: LEASE_ASSOCIATION_STEP,
    onboardingStatus: onboarding.status,
    onboarding,
  };
}

export async function getTenantIdentityVerification(user: any) {
  const state = await ensureTenantStepReady(user, CREATE_ACCOUNT_STEP);
  const payload = getStepData<Record<string, unknown>>(
    state,
    IDENTITY_VERIFICATION_STEP
  );

  const defaultFullName = [user.profile?.firstName, user.profile?.lastName]
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .trim();

  return {
    stepKey: IDENTITY_VERIFICATION_STEP,
    identityVerification:
      payload ?? {
        fullName: defaultFullName || null,
        dateOfBirth: null,
        phoneNumber: user.phone ?? null,
        acceptedTermsAndPrivacyPolicy: false,
      },
    completed: Boolean(state.completedSteps?.includes(IDENTITY_VERIFICATION_STEP)),
    nextStep: LEASE_ASSOCIATION_STEP,
  };
}

export async function lookupTenantLeaseAssociation(
  user: any,
  input: TenantLeaseAssociationLookupInput
) {
  await ensureTenantStepReady(user, IDENTITY_VERIFICATION_STEP);
  const lookup = await buildLeaseAssociationLookup(input.propertyCode);

  return {
    stepKey: LEASE_ASSOCIATION_STEP,
    propertyLookup: lookup,
    completed: false,
    nextStep: PROGRAM_EXPLANATION_STEP,
  };
}

export async function saveTenantLeaseAssociation(
  user: any,
  input: TenantLeaseAssociationInput
) {
  const state = await ensureTenantStepReady(user, IDENTITY_VERIFICATION_STEP);
  const lookup = await buildLeaseAssociationLookup(input.propertyCode);
  const selectedUnit = lookup.units.find((unit) => unit.id === input.unitId);

  if (!selectedUnit) {
    throw new AppError(
      'Selected unit does not belong to the provided property code',
      400
    );
  }

  const payload = {
    associationMethod: 'PROPERTY_CODE',
    propertyId: lookup.property.id,
    propertyCode: lookup.property.propertyCode,
    propertyName: lookup.property.name,
    propertyAddress: lookup.property.address,
    propertyCity: lookup.property.city,
    propertyState: lookup.property.state,
    propertyCountry: lookup.property.country,
    unitId: selectedUnit.id,
    unitNumber: selectedUnit.unitNumber,
    unitStatus: selectedUnit.status,
    confirmedAt: new Date().toISOString(),
  };

  state.role = user.role;
  state.stepData = {
    ...(state.stepData ?? {}),
    [LEASE_ASSOCIATION_STEP]: payload,
  };

  if (!state.completedSteps.includes(LEASE_ASSOCIATION_STEP)) {
    state.completedSteps.push(LEASE_ASSOCIATION_STEP);
  }

  state.status = 'IN_PROGRESS';
  state.updatedAt = new Date();
  await state.save();

  await writeAuditEvent({
    actorUserId: user._id as Types.ObjectId,
    action: 'TENANT_LEASE_ASSOCIATION_SAVED',
    entityType: 'OnboardingState',
    entityId: user._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        stepKey: LEASE_ASSOCIATION_STEP,
        propertyId: payload.propertyId,
        unitId: payload.unitId,
      },
    },
  });

  const onboarding = await evaluateOnboarding(user);

  return {
    message: 'Lease association saved successfully',
    stepKey: LEASE_ASSOCIATION_STEP,
    leaseAssociation: payload,
    confirmationPreview: {
      property: payload.propertyName,
      address: `${payload.propertyCity}, ${payload.propertyState}`,
      unit: payload.unitNumber,
    },
    completed: true,
    nextStep: PROGRAM_EXPLANATION_STEP,
    onboardingStatus: onboarding.status,
    onboarding,
  };
}

export async function getTenantLeaseAssociation(user: any) {
  const state = await ensureTenantStepReady(user, IDENTITY_VERIFICATION_STEP);
  const payload = await getLeaseAssociationPayload(user, state);

  return {
    stepKey: LEASE_ASSOCIATION_STEP,
    leaseAssociation: payload,
    completed:
      Boolean(state.completedSteps?.includes(LEASE_ASSOCIATION_STEP)) ||
      Boolean(payload),
    nextStep: PROGRAM_EXPLANATION_STEP,
  };
}

export async function getTenantProgramExplanation(user: any) {
  const state = await ensureTenantStepReady(user, LEASE_ASSOCIATION_STEP);
  const leaseAssociation = await getLeaseAssociationPayload(user, state);

  if (!leaseAssociation) {
    throw new AppError(
      'Lease association is required before program explanation',
      400
    );
  }

  const acknowledgement = getStepData<Record<string, unknown>>(
    state,
    PROGRAM_EXPLANATION_STEP
  );

  return {
    stepKey: PROGRAM_EXPLANATION_STEP,
    programExplanation: buildProgramExplanationContent(leaseAssociation),
    acknowledgement,
    completed: Boolean(state.completedSteps?.includes(PROGRAM_EXPLANATION_STEP)),
    nextStep: PARTICIPATION_STATUS_STEP,
  };
}

export async function saveTenantProgramExplanation(
  user: any,
  input: TenantProgramExplanationInput
) {
  const state = await ensureTenantStepReady(user, LEASE_ASSOCIATION_STEP);
  const leaseAssociation = await getLeaseAssociationPayload(user, state);

  if (!leaseAssociation) {
    throw new AppError(
      'Lease association is required before program explanation',
      400
    );
  }

  const acknowledged =
    input.acknowledgedNoOwnership === true || input.acknowledgement === true;

  if (!acknowledged) {
    throw new AppError(
      'You must acknowledge that the program does not grant ownership, title, or property rights',
      400
    );
  }

  const payload = {
    acknowledgedNoOwnership: true,
    acknowledgedAt: new Date().toISOString(),
  };

  state.role = user.role;
  state.stepData = {
    ...(state.stepData ?? {}),
    [PROGRAM_EXPLANATION_STEP]: payload,
  };

  if (!state.completedSteps.includes(PROGRAM_EXPLANATION_STEP)) {
    state.completedSteps.push(PROGRAM_EXPLANATION_STEP);
  }

  state.status = 'IN_PROGRESS';
  state.updatedAt = new Date();
  await state.save();

  await writeAuditEvent({
    actorUserId: user._id as Types.ObjectId,
    action: 'TENANT_PROGRAM_EXPLANATION_ACKNOWLEDGED',
    entityType: 'OnboardingState',
    entityId: user._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        stepKey: PROGRAM_EXPLANATION_STEP,
        acknowledgedNoOwnership: true,
      },
    },
  });

  const onboarding = await evaluateOnboarding(user);

  return {
    message: 'Program explanation acknowledged successfully',
    stepKey: PROGRAM_EXPLANATION_STEP,
    programExplanation: buildProgramExplanationContent(leaseAssociation),
    acknowledgement: payload,
    completed: true,
    nextStep: PARTICIPATION_STATUS_STEP,
    onboardingStatus: onboarding.status,
    onboarding,
  };
}

export async function getTenantParticipationStatus(user: any) {
  const state = await ensureTenantStepReady(user, PROGRAM_EXPLANATION_STEP);
  const leaseAssociation = await getLeaseAssociationPayload(user, state);

  if (!leaseAssociation) {
    throw new AppError(
      'Lease association is required before participation status',
      400
    );
  }

  const participationStatus = await buildParticipationStatusContent(
    user,
    leaseAssociation
  );
  const viewState = getStepData<Record<string, unknown>>(
    state,
    PARTICIPATION_STATUS_STEP
  );

  return {
    stepKey: PARTICIPATION_STATUS_STEP,
    participationStatus,
    viewedAt: viewState?.viewedAt ?? null,
    completed: Boolean(state.completedSteps?.includes(PARTICIPATION_STATUS_STEP)),
    nextStep: DASHBOARD_WALKTHROUGH_STEP,
  };
}

export async function saveTenantParticipationStatus(user: any) {
  const state = await ensureTenantStepReady(user, PROGRAM_EXPLANATION_STEP);
  const leaseAssociation = await getLeaseAssociationPayload(user, state);

  if (!leaseAssociation) {
    throw new AppError(
      'Lease association is required before participation status',
      400
    );
  }

  const participationStatus = await buildParticipationStatusContent(
    user,
    leaseAssociation
  );

  const payload = {
    viewedAt: new Date().toISOString(),
    tepaStatus: participationStatus.tepaProgram.status,
    rewardsStatus: participationStatus.rewardsProgram.status,
  };

  state.role = user.role;
  state.stepData = {
    ...(state.stepData ?? {}),
    [PARTICIPATION_STATUS_STEP]: payload,
  };

  if (!state.completedSteps.includes(PARTICIPATION_STATUS_STEP)) {
    state.completedSteps.push(PARTICIPATION_STATUS_STEP);
  }

  state.status = 'IN_PROGRESS';
  state.updatedAt = new Date();
  await state.save();

  await writeAuditEvent({
    actorUserId: user._id as Types.ObjectId,
    action: 'TENANT_PARTICIPATION_STATUS_VIEWED',
    entityType: 'OnboardingState',
    entityId: user._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        stepKey: PARTICIPATION_STATUS_STEP,
        tepaStatus: payload.tepaStatus,
      },
    },
  });

  const onboarding = await evaluateOnboarding(user);

  return {
    message: 'Participation status confirmed successfully',
    stepKey: PARTICIPATION_STATUS_STEP,
    participationStatus,
    completed: true,
    nextStep: DASHBOARD_WALKTHROUGH_STEP,
    onboardingStatus: onboarding.status,
    onboarding,
  };
}

export async function getTenantDashboardWalkthrough(user: any) {
  const state = await ensureTenantStepReady(user, PARTICIPATION_STATUS_STEP);
  const leaseAssociation = await getLeaseAssociationPayload(user, state);

  if (!leaseAssociation) {
    throw new AppError(
      'Lease association is required before dashboard walkthrough',
      400
    );
  }

  const participationStatus = await buildParticipationStatusContent(
    user,
    leaseAssociation
  );
  const dashboardWalkthrough = buildDashboardWalkthroughContent(
    leaseAssociation,
    participationStatus
  );
  const acknowledgement = getStepData<Record<string, unknown>>(
    state,
    DASHBOARD_WALKTHROUGH_STEP
  );

  return {
    stepKey: DASHBOARD_WALKTHROUGH_STEP,
    dashboardWalkthrough,
    acknowledgement,
    completed: Boolean(state.completedSteps?.includes(DASHBOARD_WALKTHROUGH_STEP)),
    nextStep: null,
  };
}

export async function saveTenantDashboardWalkthrough(
  user: any,
  input: TenantDashboardWalkthroughInput
) {
  const state = await ensureTenantStepReady(user, PARTICIPATION_STATUS_STEP);
  const leaseAssociation = await getLeaseAssociationPayload(user, state);

  if (!leaseAssociation) {
    throw new AppError(
      'Lease association is required before dashboard walkthrough',
      400
    );
  }

  const confirmed =
    input.confirmedAccurateAndNoOwnershipRights === true ||
    input.acknowledgedFinalTerms === true;

  if (!confirmed) {
    throw new AppError(
      'You must confirm your information and the non-ownership disclosure to finish onboarding',
      400
    );
  }

  const participationStatus = await buildParticipationStatusContent(
    user,
    leaseAssociation
  );
  const dashboardWalkthrough = buildDashboardWalkthroughContent(
    leaseAssociation,
    participationStatus
  );

  const payload = {
    confirmedAccurateAndNoOwnershipRights: true,
    confirmedAt: new Date().toISOString(),
  };

  state.role = user.role;
  state.stepData = {
    ...(state.stepData ?? {}),
    [DASHBOARD_WALKTHROUGH_STEP]: payload,
  };

  if (!state.completedSteps.includes(DASHBOARD_WALKTHROUGH_STEP)) {
    state.completedSteps.push(DASHBOARD_WALKTHROUGH_STEP);
  }

  state.updatedAt = new Date();
  await state.save();

  await writeAuditEvent({
    actorUserId: user._id as Types.ObjectId,
    action: 'TENANT_DASHBOARD_WALKTHROUGH_COMPLETED',
    entityType: 'OnboardingState',
    entityId: user._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        stepKey: DASHBOARD_WALKTHROUGH_STEP,
        confirmedAccurateAndNoOwnershipRights: true,
      },
    },
  });

  const onboarding = await evaluateOnboarding(user);

  return {
    message: 'Tenant onboarding completed successfully',
    stepKey: DASHBOARD_WALKTHROUGH_STEP,
    dashboardWalkthrough,
    acknowledgement: payload,
    completed: true,
    nextStep: null,
    redirectTo: dashboardWalkthrough.redirectTo,
    onboardingStatus: onboarding.status,
    onboarding,
  };
}
