import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { generateJwt } from '../../../core/config/passport';
import { writeAuditEvent } from '../../audit/services/audit.service';
import { User } from '../../auth/models/user.model';
import { Organization } from '../../orgs/models/organization.model';
import { Membership } from '../../orgs/models/membership.model';
import { OnboardingState } from '../models/onboarding-state.model';
import { evaluateOnboarding } from './onboarding.service';
import {
  assertInvestorRegistrationEligibility,
  consumeInvestorInviteToken,
} from './investor-interest.service';
import { issueOtpForUser, verifyUserOtp } from '../../../core/email/email-otp.service';

export { verifyUserOtp as verifyInvestorOtp };

const CREATE_ACCOUNT_STEP = 'create_account';
const INVESTOR_STATUS_ACKNOWLEDGMENT_STEP = 'investor_status_acknowledgment';
const INVESTMENT_PREFERENCES_STEP = 'investment_preferences';
const LEGAL_ACKNOWLEDGMENTS_STEP = 'legal_acknowledgments';
const ALL_SET_STEP = 'all_set';
const NEXT_STEP = 'investor_status_acknowledgment';

const INVESTOR_STATUS_ACKNOWLEDGMENT_ITEMS = [
  {
    key: 'confirmsAccreditedInvestorStatus',
    label:
      'I confirm my status as an accredited investor, for classification purposes only.',
  },
  {
    key: 'understandsNoGovernanceOccupancyOwnershipRights',
    label:
      'I understand this does not grant any governance, occupancy, or ownership rights.',
  },
  {
    key: 'acknowledgesVerificationOccursOutsidePlatform',
    label:
      'I acknowledge that any verification, if required, occurs outside the platform.',
  },
] as const;

const INVESTOR_PORTFOLIO_EXPOSURE_OPTIONS = [
  {
    key: 'PORTFOLIO_LEVEL_EXPOSURE',
    label: 'Portfolio-level exposure',
  },
  {
    key: 'PROPERTY_LEVEL_SUMMARIES',
    label: 'Property-level summaries',
  },
  {
    key: 'UNIT_LEVEL_SUMMARIES',
    label: 'Unit-level summaries',
  },
] as const;

const INVESTOR_GEOGRAPHY_OPTIONS = [
  { key: 'TEXAS', label: 'Texas' },
  { key: 'CALIFORNIA', label: 'California' },
  { key: 'FLORIDA', label: 'Florida' },
  { key: 'NATIONAL', label: 'National' },
] as const;

const INVESTOR_RISK_PROFILE_OPTIONS = [
  { key: 'CONSERVATIVE', label: 'Conservative' },
  { key: 'BALANCED', label: 'Balanced' },
  { key: 'GROWTH', label: 'Growth' },
] as const;

const INVESTOR_LEGAL_ACKNOWLEDGMENT_ITEMS = [
  {
    key: 'understandsNoGovernanceOrVotingRights',
    label: 'I understand this does not grant governance or voting rights',
  },
  {
    key: 'understandsNoOccupancyOrTenantRights',
    label: 'I understand I have no occupancy or tenant rights',
  },
  {
    key: 'understandsReturnsAreNotGuaranteed',
    label: 'I understand returns are not guaranteed',
  },
  {
    key: 'acknowledgesEconomicParticipationOnly',
    label: 'I acknowledge economic participation only',
  },
] as const;

interface CreateInvestorAccountInput {
  onboardingToken: string;
  investorType: 'INDIVIDUAL_INVESTOR' | 'INVESTING_ON_BEHALF_OF_A_FIRM';
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  phoneNumber?: string;
  phone?: string;
  countryOfResidence: string;
  linkedinUrl?: string;
  linkedInProfileUrl?: string;
  jobTitle?: string;
  legalCompanyName?: string;
  streetAddress?: string;
  companyCountry?: string;
  companyStateOrProvince?: string;
  companyCity?: string;
  companyEmail?: string;
  companyPhoneNumber?: string;
}

interface InvestorStatusAcknowledgmentInput {
  confirmsAccreditedInvestorStatus?: boolean;
  understandsNoGovernanceOccupancyOwnershipRights?: boolean;
  acknowledgesVerificationOccursOutsidePlatform?: boolean;
}

interface InvestorInvestmentPreferencesInput {
  portfolioExposure?: string;
  geography?: string;
  riskProfile?: string;
}

interface InvestorLegalAcknowledgmentsInput {
  understandsNoGovernanceOrVotingRights?: boolean;
  understandsNoOccupancyOrTenantRights?: boolean;
  understandsReturnsAreNotGuaranteed?: boolean;
  acknowledgesEconomicParticipationOnly?: boolean;
}

interface InvestorAllSetInput {
  certificationAccepted?: boolean;
}

function ensureInvestorUser(user: any) {
  if (!user?._id) {
    throw new AppError('Authentication required', 401);
  }

  if (user.role !== 'INVESTOR') {
    throw new AppError('Investor only endpoint', 403);
  }
}

async function ensureInvestorStepReady(user: any, requiredStep: string) {
  ensureInvestorUser(user);

  const state = await OnboardingState.findOne({ userId: user._id }).exec();
  if (!state || !state.completedSteps?.includes(requiredStep)) {
    throw new AppError(
      `${requiredStep.replace(/_/g, ' ')} step is required before continuing`,
      400
    );
  }

  return state;
}

function getStepData<T>(state: any, stepKey: string): T | null {
  const stepData = (state?.stepData ?? {}) as Record<string, unknown>;
  return (stepData[stepKey] as T | undefined) ?? null;
}

function buildInvestorStatusAcknowledgmentPayload(
  savedData?: InvestorStatusAcknowledgmentInput | null
) {
  return {
    confirmsAccreditedInvestorStatus:
      savedData?.confirmsAccreditedInvestorStatus === true,
    understandsNoGovernanceOccupancyOwnershipRights:
      savedData?.understandsNoGovernanceOccupancyOwnershipRights === true,
    acknowledgesVerificationOccursOutsidePlatform:
      savedData?.acknowledgesVerificationOccursOutsidePlatform === true,
    acknowledgedAt: null,
  };
}

function getPortfolioExposureOption(key?: string | null) {
  return INVESTOR_PORTFOLIO_EXPOSURE_OPTIONS.find(
    (option) => option.key === key
  );
}

function getGeographyOption(key?: string | null) {
  return INVESTOR_GEOGRAPHY_OPTIONS.find((option) => option.key === key);
}

function getRiskProfileOption(key?: string | null) {
  return INVESTOR_RISK_PROFILE_OPTIONS.find((option) => option.key === key);
}

function buildInvestorInvestmentPreferencesPayload(
  savedData?: InvestorInvestmentPreferencesInput | null
) {
  const portfolioExposure =
    getPortfolioExposureOption(savedData?.portfolioExposure ?? null) ??
    getPortfolioExposureOption('PROPERTY_LEVEL_SUMMARIES');
  const geography =
    getGeographyOption(savedData?.geography ?? null) ??
    getGeographyOption('TEXAS');
  const riskProfile =
    getRiskProfileOption(savedData?.riskProfile ?? null) ??
    getRiskProfileOption('BALANCED');

  return {
    portfolioExposure,
    geography,
    riskProfile,
  };
}

function buildInvestorLegalAcknowledgmentsPayload(
  savedData?: InvestorLegalAcknowledgmentsInput | null
) {
  return {
    understandsNoGovernanceOrVotingRights:
      savedData?.understandsNoGovernanceOrVotingRights === true,
    understandsNoOccupancyOrTenantRights:
      savedData?.understandsNoOccupancyOrTenantRights === true,
    understandsReturnsAreNotGuaranteed:
      savedData?.understandsReturnsAreNotGuaranteed === true,
    acknowledgesEconomicParticipationOnly:
      savedData?.acknowledgesEconomicParticipationOnly === true,
    acknowledgedAt: null,
  };
}

function buildInvestorScopeSummary(
  savedData?: InvestorInvestmentPreferencesInput | null
) {
  const preferences = buildInvestorInvestmentPreferencesPayload(savedData);

  switch (preferences.portfolioExposure?.key) {
    case 'UNIT_LEVEL_SUMMARIES':
      return {
        title: 'Unit-Level View',
        description:
          'Project and unit detail is limited to summary-level reporting and remains anonymized where required.',
      };
    case 'PROPERTY_LEVEL_SUMMARIES':
      return {
        title: 'Property-Level View',
        description:
          'Project-level detail is aggregated and anonymized for the selected properties and programs.',
      };
    case 'PORTFOLIO_LEVEL_EXPOSURE':
    default:
      return {
        title: 'Portfolio-Level View',
        description:
          'Your dashboard reflects selected portfolios. Project-level detail is aggregated and anonymized.',
      };
  }
}

export async function createInvestorAccountFromInvite(
  input: CreateInvestorAccountInput
) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const existing = await User.findOne({ email: normalizedEmail }).lean().exec();
  if (existing) {
    throw new AppError('Email already registered', 409);
  }

  const invite = await assertInvestorRegistrationEligibility(
    input.onboardingToken,
    normalizedEmail,
    'INVESTOR'
  );

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await User.create({
    email: normalizedEmail,
    phone: input.phoneNumber?.trim() || input.phone?.trim() || undefined,
    passwordHash,
    role: invite.assignedRole,
    status: 'PENDING',
    oauthProviders: [],
    profile: {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
    },
  });

  try {
    await consumeInvestorInviteToken(
      input.onboardingToken,
      user._id as Types.ObjectId
    );
  } catch (consumeErr) {
    await User.deleteOne({ _id: user._id }).catch(() => undefined);
    throw consumeErr;
  }

  const createAccountData = {
    email: normalizedEmail,
    interestId: invite.interestId,
    assignedRole: invite.assignedRole,
    investorType: input.investorType,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    phoneNumber: input.phoneNumber?.trim() || input.phone?.trim() || null,
    countryOfResidence: input.countryOfResidence.trim(),
    typicalCheckSize: invite.prefill.typicalCheckSize,
    linkedinUrl:
      input.linkedinUrl?.trim() || input.linkedInProfileUrl?.trim() || null,
    firmDetails:
      input.investorType === 'INVESTING_ON_BEHALF_OF_A_FIRM'
        ? {
            jobTitle: input.jobTitle?.trim() || null,
            legalCompanyName: input.legalCompanyName?.trim() || null,
            streetAddress: input.streetAddress?.trim() || null,
            country: input.companyCountry?.trim() || null,
            stateOrProvince: input.companyStateOrProvince?.trim() || null,
            city: input.companyCity?.trim() || null,
            companyEmail: input.companyEmail?.trim().toLowerCase() || null,
            companyPhoneNumber: input.companyPhoneNumber?.trim() || null,
          }
        : null,
  };

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
    action: 'INVESTOR_ONBOARDING_ACCOUNT_CREATED',
    entityType: 'User',
    entityId: user._id as Types.ObjectId,
    diff: {
      before: null,
      after: createAccountData,
    },
  });

  await issueOtpForUser(user._id as Types.ObjectId, user.email, input.firstName.trim());

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

export async function getInvestorStatusAcknowledgment(user: any) {
  const state = await ensureInvestorStepReady(user, CREATE_ACCOUNT_STEP);
  const savedData = getStepData<InvestorStatusAcknowledgmentInput>(
    state,
    INVESTOR_STATUS_ACKNOWLEDGMENT_STEP
  );
  const payload = buildInvestorStatusAcknowledgmentPayload(savedData);

  const stepData = getStepData<Record<string, unknown>>(state, INVESTOR_STATUS_ACKNOWLEDGMENT_STEP);
  const acknowledgedAt =
    typeof stepData?.acknowledgedAt === 'string' ? stepData.acknowledgedAt : null;

  return {
    stepKey: INVESTOR_STATUS_ACKNOWLEDGMENT_STEP,
    acknowledgment: {
      ...payload,
      acknowledgedAt,
    },
    acknowledgementItems: INVESTOR_STATUS_ACKNOWLEDGMENT_ITEMS,
    verificationBoundary: {
      title: 'Verification Boundary',
      description:
        'Any verification, if required, occurs outside the platform.',
    },
    aiInsights: {
      title: 'AI Insights',
      description:
        'AI helps summarize trends and highlight potential risks or opportunities. Insights are suggestions only and may not always be accurate.',
    },
    footerNote:
      'This information is used for public reporting and access control.',
    completed: Boolean(
      state.completedSteps?.includes(INVESTOR_STATUS_ACKNOWLEDGMENT_STEP)
    ),
    nextStep: INVESTMENT_PREFERENCES_STEP,
  };
}

export async function saveInvestorStatusAcknowledgment(
  user: any,
  input: InvestorStatusAcknowledgmentInput
) {
  const state = await ensureInvestorStepReady(user, CREATE_ACCOUNT_STEP);

  if (input.confirmsAccreditedInvestorStatus !== true) {
    throw new AppError(
      'You must confirm accredited investor status to continue',
      400
    );
  }

  if (input.understandsNoGovernanceOccupancyOwnershipRights !== true) {
    throw new AppError(
      'You must acknowledge that no governance, occupancy, or ownership rights are granted',
      400
    );
  }

  if (input.acknowledgesVerificationOccursOutsidePlatform !== true) {
    throw new AppError(
      'You must acknowledge that any verification occurs outside the platform',
      400
    );
  }

  const payload = {
    confirmsAccreditedInvestorStatus: true,
    understandsNoGovernanceOccupancyOwnershipRights: true,
    acknowledgesVerificationOccursOutsidePlatform: true,
    acknowledgedAt: new Date().toISOString(),
  };

  state.role = user.role;
  state.stepData = {
    ...(state.stepData ?? {}),
    [INVESTOR_STATUS_ACKNOWLEDGMENT_STEP]: payload,
  };

  if (!state.completedSteps.includes(INVESTOR_STATUS_ACKNOWLEDGMENT_STEP)) {
    state.completedSteps.push(INVESTOR_STATUS_ACKNOWLEDGMENT_STEP);
  }

  state.status = 'IN_PROGRESS';
  state.updatedAt = new Date();
  await state.save();

  await writeAuditEvent({
    actorUserId: user._id as Types.ObjectId,
    action: 'INVESTOR_STATUS_ACKNOWLEDGMENT_SUBMITTED',
    entityType: 'OnboardingState',
    entityId: user._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        stepKey: INVESTOR_STATUS_ACKNOWLEDGMENT_STEP,
        ...payload,
      },
    },
  });

  const onboarding = await evaluateOnboarding(user);

  return {
    message: 'Investor status acknowledgment saved successfully',
    stepKey: INVESTOR_STATUS_ACKNOWLEDGMENT_STEP,
    acknowledgment: payload,
    acknowledgementItems: INVESTOR_STATUS_ACKNOWLEDGMENT_ITEMS,
    completed: true,
    nextStep: INVESTMENT_PREFERENCES_STEP,
    onboardingStatus: onboarding.status,
    onboarding,
  };
}

export async function getInvestorInvestmentPreferences(user: any) {
  const state = await ensureInvestorStepReady(
    user,
    INVESTOR_STATUS_ACKNOWLEDGMENT_STEP
  );
  const savedData = getStepData<InvestorInvestmentPreferencesInput>(
    state,
    INVESTMENT_PREFERENCES_STEP
  );
  const preferences = buildInvestorInvestmentPreferencesPayload(savedData);

  return {
    stepKey: INVESTMENT_PREFERENCES_STEP,
    investmentPreferences: preferences,
    portfolioExposureOptions: INVESTOR_PORTFOLIO_EXPOSURE_OPTIONS,
    geographyOptions: INVESTOR_GEOGRAPHY_OPTIONS,
    riskProfileOptions: INVESTOR_RISK_PROFILE_OPTIONS,
    aiInsights: {
      title: 'AI Insights',
      description:
        'AI helps summarize trends and highlight potential risks or opportunities. Insights are suggestions only and may not always be accurate.',
    },
    footerNote:
      'These preferences are for dashboard display and reporting purposes only. They do not affect portfolio construction, asset selection, or capital deployment.',
    completed: Boolean(state.completedSteps?.includes(INVESTMENT_PREFERENCES_STEP)),
    nextStep: LEGAL_ACKNOWLEDGMENTS_STEP,
  };
}

export async function saveInvestorInvestmentPreferences(
  user: any,
  input: InvestorInvestmentPreferencesInput
) {
  const state = await ensureInvestorStepReady(
    user,
    INVESTOR_STATUS_ACKNOWLEDGMENT_STEP
  );

  const portfolioExposure = getPortfolioExposureOption(input.portfolioExposure);
  if (!portfolioExposure) {
    throw new AppError('portfolioExposure is invalid', 400);
  }

  const geography = getGeographyOption(input.geography);
  if (!geography) {
    throw new AppError('geography is invalid', 400);
  }

  const riskProfile = getRiskProfileOption(input.riskProfile);
  if (!riskProfile) {
    throw new AppError('riskProfile is invalid', 400);
  }

  const payload = {
    portfolioExposure: portfolioExposure.key,
    geography: geography.key,
    riskProfile: riskProfile.key,
    savedAt: new Date().toISOString(),
  };

  state.role = user.role;
  state.stepData = {
    ...(state.stepData ?? {}),
    [INVESTMENT_PREFERENCES_STEP]: payload,
  };

  if (!state.completedSteps.includes(INVESTMENT_PREFERENCES_STEP)) {
    state.completedSteps.push(INVESTMENT_PREFERENCES_STEP);
  }

  state.status = 'IN_PROGRESS';
  state.updatedAt = new Date();
  await state.save();

  await writeAuditEvent({
    actorUserId: user._id as Types.ObjectId,
    action: 'INVESTOR_INVESTMENT_PREFERENCES_SUBMITTED',
    entityType: 'OnboardingState',
    entityId: user._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        stepKey: INVESTMENT_PREFERENCES_STEP,
        ...payload,
      },
    },
  });

  const onboarding = await evaluateOnboarding(user);

  return {
    message: 'Investment preferences saved successfully',
    stepKey: INVESTMENT_PREFERENCES_STEP,
    investmentPreferences: buildInvestorInvestmentPreferencesPayload(payload),
    portfolioExposureOptions: INVESTOR_PORTFOLIO_EXPOSURE_OPTIONS,
    geographyOptions: INVESTOR_GEOGRAPHY_OPTIONS,
    riskProfileOptions: INVESTOR_RISK_PROFILE_OPTIONS,
    completed: true,
    nextStep: LEGAL_ACKNOWLEDGMENTS_STEP,
    onboardingStatus: onboarding.status,
    onboarding,
  };
}

export async function getInvestorLegalAcknowledgments(user: any) {
  const state = await ensureInvestorStepReady(user, INVESTMENT_PREFERENCES_STEP);
  const savedData = getStepData<InvestorLegalAcknowledgmentsInput>(
    state,
    LEGAL_ACKNOWLEDGMENTS_STEP
  );
  const payload = buildInvestorLegalAcknowledgmentsPayload(savedData);

  const stepData = getStepData<Record<string, unknown>>(
    state,
    LEGAL_ACKNOWLEDGMENTS_STEP
  );
  const acknowledgedAt =
    typeof stepData?.acknowledgedAt === 'string' ? stepData.acknowledgedAt : null;

  return {
    stepKey: LEGAL_ACKNOWLEDGMENTS_STEP,
    legalAcknowledgments: {
      ...payload,
      acknowledgedAt,
    },
    acknowledgementItems: INVESTOR_LEGAL_ACKNOWLEDGMENT_ITEMS,
    aiInsights: {
      title: 'AI Insights',
      description:
        'AI helps summarize trends and highlight potential risks or opportunities. Insights are suggestions only and may not always be accurate.',
    },
    exitLiquidityRules: {
      title: 'Exit & Liquidity Rules',
      description:
        'Exit rules exist and depend on the program terms. Exposure may end due to asset sale, fund close, or opt-out conditions defined in disclosures.',
    },
    footerNote:
      'This platform does not confer ownership, control, or management authority.',
    completed: Boolean(state.completedSteps?.includes(LEGAL_ACKNOWLEDGMENTS_STEP)),
    nextStep: ALL_SET_STEP,
  };
}

export async function saveInvestorLegalAcknowledgments(
  user: any,
  input: InvestorLegalAcknowledgmentsInput
) {
  const state = await ensureInvestorStepReady(user, INVESTMENT_PREFERENCES_STEP);

  if (input.understandsNoGovernanceOrVotingRights !== true) {
    throw new AppError(
      'You must acknowledge that governance or voting rights are not granted',
      400
    );
  }

  if (input.understandsNoOccupancyOrTenantRights !== true) {
    throw new AppError(
      'You must acknowledge that occupancy or tenant rights are not granted',
      400
    );
  }

  if (input.understandsReturnsAreNotGuaranteed !== true) {
    throw new AppError(
      'You must acknowledge that returns are not guaranteed',
      400
    );
  }

  if (input.acknowledgesEconomicParticipationOnly !== true) {
    throw new AppError(
      'You must acknowledge economic participation only',
      400
    );
  }

  const payload = {
    understandsNoGovernanceOrVotingRights: true,
    understandsNoOccupancyOrTenantRights: true,
    understandsReturnsAreNotGuaranteed: true,
    acknowledgesEconomicParticipationOnly: true,
    acknowledgedAt: new Date().toISOString(),
  };

  state.role = user.role;
  state.stepData = {
    ...(state.stepData ?? {}),
    [LEGAL_ACKNOWLEDGMENTS_STEP]: payload,
  };

  if (!state.completedSteps.includes(LEGAL_ACKNOWLEDGMENTS_STEP)) {
    state.completedSteps.push(LEGAL_ACKNOWLEDGMENTS_STEP);
  }

  state.status = 'IN_PROGRESS';
  state.updatedAt = new Date();
  await state.save();

  await writeAuditEvent({
    actorUserId: user._id as Types.ObjectId,
    action: 'INVESTOR_LEGAL_ACKNOWLEDGMENTS_SUBMITTED',
    entityType: 'OnboardingState',
    entityId: user._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        stepKey: LEGAL_ACKNOWLEDGMENTS_STEP,
        ...payload,
      },
    },
  });

  const onboarding = await evaluateOnboarding(user);

  return {
    message: 'Legal acknowledgments saved successfully',
    stepKey: LEGAL_ACKNOWLEDGMENTS_STEP,
    legalAcknowledgments: payload,
    acknowledgementItems: INVESTOR_LEGAL_ACKNOWLEDGMENT_ITEMS,
    completed: true,
    nextStep: ALL_SET_STEP,
    onboardingStatus: onboarding.status,
    onboarding,
  };
}

export async function getInvestorAllSet(user: any) {
  const state = await ensureInvestorStepReady(user, LEGAL_ACKNOWLEDGMENTS_STEP);
  const savedPreferences = getStepData<InvestorInvestmentPreferencesInput>(
    state,
    INVESTMENT_PREFERENCES_STEP
  );
  const savedAllSet = getStepData<InvestorAllSetInput>(state, ALL_SET_STEP);
  const createAccountData = getStepData<Record<string, unknown>>(
    state,
    CREATE_ACCOUNT_STEP
  );
  const scopeSummary = buildInvestorScopeSummary(savedPreferences);
  const exposureLabel =
    buildInvestorInvestmentPreferencesPayload(savedPreferences).portfolioExposure
      ?.label ?? 'Portfolio-level exposure';

  return {
    stepKey: ALL_SET_STEP,
    title: "You're All Set",
    subtitle: "Your investor account is ready. Here's what you can see and do.",
    whatYouCanSee: [
      `${exposureLabel}`,
      'Aggregate economic activity',
      'Program impact summaries',
    ],
    whatYouCannotDo: [
      'Modify properties or programs',
      'View tenant identities',
      'Influence management decisions',
    ],
    roleSummary: {
      title: 'Investor',
      description:
        'You are enrolled as an investor. You do not have governance, occupancy, or management rights.',
    },
    scopeSummary,
    accessLevel: {
      title: 'Read-Only Dashboard',
      description:
        'All metrics and insights are for viewing purposes only. No changes affect property, tenants, or capital.',
    },
    aiInsights: {
      title: 'AI Insights',
      description:
        'AI helps summarize trends and highlight potential risks or opportunities. Insights are suggestions only and may not always be accurate.',
    },
    certificationAccepted: savedAllSet?.certificationAccepted === true,
    footerNote: 'Your dashboard is read-only by default.',
    accountSummary: {
      investorType:
        typeof createAccountData?.investorType === 'string'
          ? createAccountData.investorType
          : null,
      assignedRole:
        typeof createAccountData?.assignedRole === 'string'
          ? createAccountData.assignedRole
          : null,
    },
    completed: Boolean(state.completedSteps?.includes(ALL_SET_STEP)),
    nextStep: null,
  };
}

async function promoteInvestorOnboardingToDomainCollections(
  user: any,
  stepData: Record<string, unknown>
): Promise<void> {
  const createAccountData = (stepData[CREATE_ACCOUNT_STEP] ?? {}) as Record<string, unknown>;
  const firmDetails = (createAccountData.firmDetails ?? {}) as Record<string, unknown>;

  const orgName =
    typeof firmDetails.legalCompanyName === 'string' && firmDetails.legalCompanyName.trim()
      ? firmDetails.legalCompanyName.trim()
      : `${user.profile?.firstName ?? ''} ${user.profile?.lastName ?? ''}`.trim() || user.email;

  // Idempotent: reuse existing org for this investor
  let org = await Organization.findOne({ primaryContactUserId: user._id }).exec();
  if (!org) {
    org = await Organization.create({
      type: 'INVESTOR_ORG',
      name: orgName,
      primaryContactUserId: user._id,
    });
  }

  // Idempotent: upsert membership so running all-set twice is safe
  await Membership.findOneAndUpdate(
    { userId: user._id, orgId: org._id },
    { $set: { roleInOrg: 'OWNER', status: 'active' } },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

export async function saveInvestorAllSet(
  user: any,
  input: InvestorAllSetInput
) {
  const state = await ensureInvestorStepReady(user, LEGAL_ACKNOWLEDGMENTS_STEP);

  if (input.certificationAccepted !== true) {
    throw new AppError(
      'You must certify that you reviewed your access and role limitations to continue',
      400
    );
  }

  const payload = {
    certificationAccepted: true,
    confirmedAt: new Date().toISOString(),
  };

  state.role = user.role;
  state.stepData = {
    ...(state.stepData ?? {}),
    [ALL_SET_STEP]: payload,
  };

  if (!state.completedSteps.includes(ALL_SET_STEP)) {
    state.completedSteps.push(ALL_SET_STEP);
  }

  state.status = 'COMPLETE';
  state.updatedAt = new Date();
  await state.save();

  await promoteInvestorOnboardingToDomainCollections(user, state.stepData as Record<string, unknown>);

  await writeAuditEvent({
    actorUserId: user._id as Types.ObjectId,
    action: 'INVESTOR_ALL_SET_CONFIRMED',
    entityType: 'OnboardingState',
    entityId: user._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        stepKey: ALL_SET_STEP,
        ...payload,
      },
    },
  });

  const onboarding = await evaluateOnboarding(user);

  return {
    message: 'Investor onboarding completed successfully',
    stepKey: ALL_SET_STEP,
    certificationAccepted: true,
    dashboardAccessGranted: true,
    completed: true,
    nextStep: null,
    onboardingStatus: onboarding.status,
    onboarding,
  };
}
