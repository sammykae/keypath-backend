import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { generateJwt } from '../../../core/config/passport';
import { writeAuditEvent } from '../../audit/services/audit.service';
import { User } from '../../auth/models/user.model';
import { Organization } from '../../orgs/models/organization.model';
import { Membership } from '../../orgs/models/membership.model';
import { ProgramProjectModel } from '../../program/models/program.model';
import { OnboardingState } from '../models/onboarding-state.model';
import { evaluateOnboarding } from './onboarding.service';
import {
  assertCommunityRegistrationEligibility,
  consumeCommunityInviteToken,
} from './community-interest.service';
import { issueOtpForUser, verifyUserOtp } from '../../../core/email/email-otp.service';

export { verifyUserOtp as verifyCommunityOtp };
import {
  COMMUNITY_STAKEHOLDER_TYPE_OPTIONS,
  DEFAULT_COMMUNITY_STAKEHOLDER_TYPE,
  type CommunityStakeholderTypeKey,
  buildCommunityStakeholderProfileResponse,
  getCommunityStakeholderTypeOption,
  isKnownCommunityStakeholderType,
  resolveCommunityStakeholderType,
} from '../constants/community-stakeholder-types';

const CREATE_ACCOUNT_STEP = 'create_account';
const ORGANIZATION_INFORMATION_STEP = 'organization_information';
const STAKEHOLDER_TYPE_STEP = 'stakeholder_type';
const PROGRAM_ASSOCIATION_STEP = 'program_association';
const DATA_VISIBILITY_PRIVACY_STEP = 'data_visibility_privacy';
const IMPACT_GOALS_STEP = 'impact_goals';
const REVIEW_ACTIVATE_STEP = 'review_activate';

const e164PhoneRegex = /^\+?[1-9]\d{6,14}$/;

const COMMUNITY_OVERSIGHT_LEVEL_OPTIONS = [
  {
    key: 'PORTFOLIO_LEVEL_OVERVIEW',
    label: 'Portfolio-level overview',
    description:
      'Provides aggregate insights across projects and portfolios.',
  },
  {
    key: 'PROJECT_LEVEL_VISIBILITY',
    label: 'Project-level visibility',
    description:
      'Limits visibility to the selected developments and project dashboards.',
  },
] as const;

const COMMUNITY_DATA_ACCESS_ITEMS = [
  {
    key: 'PROJECT_LEVEL_PERFORMANCE_METRICS',
    label: 'Project-level performance metrics',
  },
  {
    key: 'AGGREGATE_TENANT_PARTICIPATION_DATA',
    label: 'Aggregate tenant participation data',
  },
  {
    key: 'LOCAL_ECONOMIC_IMPACT_METRICS',
    label: 'Local economic impact metrics',
  },
  {
    key: 'COMPLIANCE_AND_PLEDGE_TRACKING',
    label: 'Compliance and pledge tracking',
  },
] as const;

const COMMUNITY_DATA_RESTRICTIONS = [
  {
    key: 'NO_TENANT_PII',
    label: 'No tenant PII access',
  },
  {
    key: 'NO_LENDER_SENSITIVE_INFORMATION',
    label: 'No lender-sensitive information',
  },
  {
    key: 'OVERSIGHT_VISIBILITY_ONLY',
    label: 'Oversight visibility only',
  },
  {
    key: 'NO_OPERATIONAL_CONTROL',
    label: 'No operational control or individual-level access',
  },
] as const;

const COMMUNITY_IMPACT_GOAL_OPTIONS = [
  {
    key: 'HOUSING_STABILITY_AND_TENANT_RETENTION',
    label: 'Housing stability & tenant retention',
  },
  {
    key: 'LOCAL_JOB_CREATION',
    label: 'Local job creation',
  },
  {
    key: 'LOCAL_VENDOR_AND_SMALL_BUSINESS_USAGE',
    label: 'Local vendor & small business usage',
  },
  {
    key: 'ESG_AND_COMMUNITY_COMMITMENTS',
    label: 'ESG & community commitments',
  },
] as const;

const COMMUNITY_IMPACT_METRIC_PREVIEW = [
  {
    key: 'PARTICIPATION_TRENDS',
    title: 'Participation Trends',
    description:
      'Opt-in growth over time, participation rate changes, and cohort-level trends.',
  },
  {
    key: 'AGGREGATE_ECONOMIC_OUTCOMES',
    title: 'Aggregate Economic Outcomes',
    description:
      'Total participation value, average range per tenant, and year-over-year change.',
  },
  {
    key: 'RETENTION_IMPACT',
    title: 'Retention Impact',
    description:
      'Retention comparison for TEPA vs non-TEPA groups (aggregate only).',
  },
  {
    key: 'PROGRAM_HEALTH_SNAPSHOT',
    title: 'Program Health Snapshot',
    description:
      'Units delivered vs planned, occupancy rate, and compliance status overview.',
  },
] as const;

type CommunityOversightLevelKey =
  (typeof COMMUNITY_OVERSIGHT_LEVEL_OPTIONS)[number]['key'];
type CommunityImpactGoalKey =
  (typeof COMMUNITY_IMPACT_GOAL_OPTIONS)[number]['key'];

type CommunityUserRole = 'COMMUNITY' | 'COMMUNITY_STAKEHOLDER';

export interface CreateCommunityAccountInput {
  onboardingToken: string;
  email: string;
  password: string;
  phone?: string;
}

export interface CommunityOrganizationInformationInput {
  organizationName: string;
  titleRoleAtOrganization: string;
  cityRegionServed: string;
  phoneNumber?: string;
  department?: string;
  jurisdiction?: string;
  role?: string;
}

export interface CommunityStakeholderTypeInput {
  stakeholderType: CommunityStakeholderTypeKey | string;
}

export interface CommunityProgramAssociationInput {
  projectIds?: string[];
  selectedProjectIds?: string[];
  programProjectIds?: string[];
  oversightLevel: CommunityOversightLevelKey | string;
}

export interface CommunityDataVisibilityPrivacyInput {
  acknowledgedVisibilityRules?: boolean;
  reviewed?: boolean;
}

export interface CommunityImpactGoalsInput {
  impactGoals: CommunityImpactGoalKey[] | string[];
  selectedImpactGoals?: CommunityImpactGoalKey[] | string[];
  goals?: CommunityImpactGoalKey[] | string[];
  acknowledgedOversightAccessAndExitRules?: boolean;
}

export interface CommunityReviewActivateInput {
  certificationAccepted?: boolean;
  authorizedAccessCertification?: boolean;
  certifyAndActivate?: boolean;
  confirmActivate?: boolean;
}

function ensureCommunity(user: any): asserts user is {
  _id: Types.ObjectId;
  role: CommunityUserRole;
  email: string;
  phone?: string;
  profile?: {
    firstName?: string;
    lastName?: string;
    address?: string;
  };
} {
  if (!user) {
    throw new AppError('Authentication required', 401);
  }

  if (!['COMMUNITY', 'COMMUNITY_STAKEHOLDER'].includes(user.role)) {
    throw new AppError('Community only endpoint', 403);
  }
}

function getStepData<T = Record<string, unknown>>(state: any, stepKey: string) {
  const stepData = (state?.stepData ?? {}) as Record<string, unknown>;
  return (stepData[stepKey] as T | undefined) ?? null;
}

function requireTrimmedString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError(`${fieldName} is required`, 400);
  }

  return value.trim();
}

function getCommunityRoleLabel(role: string): string {
  return role
    .toLowerCase()
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function normalizeCommunityStakeholderType(
  value: unknown
): CommunityStakeholderTypeKey {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError('stakeholderType is required', 400);
  }

  if (!isKnownCommunityStakeholderType(value)) {
    throw new AppError('stakeholderType is invalid', 400);
  }

  return resolveCommunityStakeholderType(value);
}

function tryResolveCommunityStakeholderType(
  value: unknown
): CommunityStakeholderTypeKey | null {
  if (!isKnownCommunityStakeholderType(value)) {
    return null;
  }

  return resolveCommunityStakeholderType(value);
}

async function syncCommunityStakeholderProfile(
  userId: Types.ObjectId,
  fields: {
    organizationName?: string;
    stakeholderType?: string;
    titleRoleAtOrganization?: string;
    cityRegionServed?: string;
    phoneNumber?: string;
  }
): Promise<void> {
  const update: Record<string, unknown> = {};

  if (fields.organizationName !== undefined) {
    update['profile.communityStakeholder.organizationName'] = fields.organizationName;
  }
  if (fields.stakeholderType !== undefined) {
    update['profile.communityStakeholder.stakeholderType'] =
      resolveCommunityStakeholderType(fields.stakeholderType);
  }
  if (fields.titleRoleAtOrganization !== undefined) {
    update['profile.communityStakeholder.titleRoleAtOrganization'] =
      fields.titleRoleAtOrganization;
  }
  if (fields.cityRegionServed !== undefined) {
    update['profile.communityStakeholder.cityRegionServed'] = fields.cityRegionServed;
    update['profile.address'] = fields.cityRegionServed;
  }
  if (fields.phoneNumber !== undefined) {
    update.phone = fields.phoneNumber.trim() || undefined;
  }

  if (Object.keys(update).length === 0) {
    return;
  }

  await User.findByIdAndUpdate(userId, { $set: update }).exec();
}

function normalizeCommunityOversightLevel(
  value: unknown
): CommunityOversightLevelKey {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError('oversightLevel is required', 400);
  }

  const rawValue = value.trim();
  const exactOption = COMMUNITY_OVERSIGHT_LEVEL_OPTIONS.find(
    (option) => option.key === rawValue
  );
  if (exactOption) {
    return exactOption.key;
  }

  const normalizedValue = rawValue
    .toLowerCase()
    .replace(/[/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const labelMatch = COMMUNITY_OVERSIGHT_LEVEL_OPTIONS.find((option) => {
    const optionLabel = option.label
      .toLowerCase()
      .replace(/[/-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return optionLabel === normalizedValue;
  });

  if (!labelMatch) {
    throw new AppError('oversightLevel is invalid', 400);
  }

  return labelMatch.key;
}

function getCommunityOversightLevelOption(key: CommunityOversightLevelKey) {
  return COMMUNITY_OVERSIGHT_LEVEL_OPTIONS.find((option) => option.key === key);
}

function getProgramAssociationProjectIds(
  input: CommunityProgramAssociationInput
): string[] {
  const source =
    input.projectIds ?? input.selectedProjectIds ?? input.programProjectIds ?? [];

  if (!Array.isArray(source)) {
    return [];
  }

  const normalizedIds = Array.from(
    new Set(
      source
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );

  const invalidId = normalizedIds.find((id) => !Types.ObjectId.isValid(id));
  if (invalidId) {
    throw new AppError(`Invalid project id: ${invalidId}`, 400);
  }

  return normalizedIds;
}

function formatProgramProjectType(projectType: string): string {
  const labels: Record<string, string> = {
    BTR: 'Build-to-Rent',
    SFR: 'Single-Family Rental',
    WORKFORCE: 'Workforce Housing',
    AFFORDABLE: 'Affordable Housing',
    LUXURY: 'Luxury Residential',
    MIXED_USE: 'Mixed-Use Development',
  };

  return labels[projectType] ?? projectType;
}

function formatProgramProjectStatus(status: string): string {
  const labels: Record<string, string> = {
    LEASING: 'Leasing',
    CONSTRUCTION: 'Construction',
    STABILIZED: 'Stabilized',
  };

  return labels[status] ?? status;
}

async function listCommunityProgramAssociationProjects() {
  const projects = await ProgramProjectModel.find({})
    .sort({ name: 1 })
    .lean()
    .exec();

  return projects.map((project) => ({
    id: String(project._id),
    projectName: project.name,
    location: `${project.city}, ${project.state}`,
    programType: formatProgramProjectType(project.projectType),
    status: {
      code: project.status,
      label: formatProgramProjectStatus(project.status),
    },
  }));
}

function buildCommunityDataVisibilityPrivacyPayload(
  programAssociation: Record<string, unknown> | null,
  savedPayload?: Record<string, unknown> | null
) {
  const selectedProjects = Array.isArray(programAssociation?.selectedProjects)
    ? programAssociation.selectedProjects
    : [];
  const oversightLevel =
    typeof programAssociation?.oversightLevel === 'object' &&
    programAssociation?.oversightLevel !== null
      ? programAssociation.oversightLevel
      : COMMUNITY_OVERSIGHT_LEVEL_OPTIONS[0];
  const oversightKey =
    typeof (oversightLevel as Record<string, unknown>).key === 'string'
      ? String((oversightLevel as Record<string, unknown>).key)
      : COMMUNITY_OVERSIGHT_LEVEL_OPTIONS[0].key;

  return {
    accessScope:
      oversightKey === 'PROJECT_LEVEL_VISIBILITY'
        ? 'Selected projects only'
        : 'Portfolio-level aggregate overview',
    oversightLevel,
    selectedProjectCount: selectedProjects.length,
    selectedProjects,
    dataAccess: COMMUNITY_DATA_ACCESS_ITEMS.map((item) => ({
      ...item,
      granted: true,
    })),
    restrictions: COMMUNITY_DATA_RESTRICTIONS,
    warning: {
      title: 'This dashboard provides oversight visibility only.',
      message:
        'No operational control or individual-level data access is granted.',
    },
    policyNote:
      'These visibility levels are fixed by program policy and cannot be expanded.',
    acknowledgedVisibilityRules:
      savedPayload?.acknowledgedVisibilityRules === true,
    reviewedAt:
      typeof savedPayload?.reviewedAt === 'string' ? savedPayload.reviewedAt : null,
  };
}

function normalizeCommunityImpactGoalKeys(values: unknown): CommunityImpactGoalKey[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new AppError('At least one impact goal must be selected', 400);
  }

  const normalizedKeys = Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );

  if (normalizedKeys.length === 0) {
    throw new AppError('At least one impact goal must be selected', 400);
  }

  const validKeys = new Set(COMMUNITY_IMPACT_GOAL_OPTIONS.map((option) => option.key));
  const invalidKey = normalizedKeys.find((key) => !validKeys.has(key as CommunityImpactGoalKey));
  if (invalidKey) {
    throw new AppError(`Invalid impact goal: ${invalidKey}`, 400);
  }

  return normalizedKeys as CommunityImpactGoalKey[];
}

function buildCommunityImpactGoalsPayload(
  savedPayload?: Record<string, unknown> | null
) {
  const selectedGoals = Array.isArray(savedPayload?.selectedGoals)
    ? savedPayload.selectedGoals
    : [];
  const selectedGoalKeys = new Set(
    selectedGoals
      .map((goal) =>
        goal && typeof goal === 'object' && typeof (goal as Record<string, unknown>).key === 'string'
          ? String((goal as Record<string, unknown>).key)
          : null
      )
      .filter((goal): goal is string => Boolean(goal))
  );

  return {
    goalOptions: COMMUNITY_IMPACT_GOAL_OPTIONS.map((option) => ({
      ...option,
      selected: selectedGoalKeys.has(option.key),
    })),
    selectedGoals,
    metricsPreview: COMMUNITY_IMPACT_METRIC_PREVIEW,
    oversightAccessAndExitRules: {
      title: 'Oversight Access & Exit Rules',
      summary:
        'Economic participation via TEPA, not legal ownership, title, or deed.',
      note:
        'At least one goal is required. If your program does not track any of these outcomes, select none and your dashboard will show limited metrics.',
      acknowledged:
        savedPayload?.acknowledgedOversightAccessAndExitRules === true,
    },
  };
}

function getSelectedImpactGoalLabels(savedPayload?: Record<string, unknown> | null) {
  const selectedGoals = Array.isArray(savedPayload?.selectedGoals)
    ? savedPayload.selectedGoals
    : [];

  return selectedGoals
    .map((goal) =>
      goal && typeof goal === 'object' && typeof (goal as Record<string, unknown>).label === 'string'
        ? String((goal as Record<string, unknown>).label)
        : null
    )
    .filter((goal): goal is string => Boolean(goal));
}

function buildCommunityReviewActivatePayload(state: any) {
  const organizationInformation = getStepData<Record<string, unknown>>(
    state,
    ORGANIZATION_INFORMATION_STEP
  );
  const stakeholderType = getStepData<Record<string, unknown>>(
    state,
    STAKEHOLDER_TYPE_STEP
  );
  const programAssociation = getStepData<Record<string, unknown>>(
    state,
    PROGRAM_ASSOCIATION_STEP
  );
  const reviewActivate = getStepData<Record<string, unknown>>(
    state,
    REVIEW_ACTIVATE_STEP
  );
  const impactGoals = getStepData<Record<string, unknown>>(state, IMPACT_GOALS_STEP);

  const selectedProjects = Array.isArray(programAssociation?.selectedProjects)
    ? programAssociation.selectedProjects
    : [];
  const statusCounts = selectedProjects.reduce<Record<string, number>>((acc, project) => {
    const statusLabel =
      project &&
      typeof project === 'object' &&
      typeof (project as Record<string, unknown>).status === 'object' &&
      (project as Record<string, unknown>).status !== null &&
      typeof ((project as Record<string, unknown>).status as Record<string, unknown>).label === 'string'
        ? String(
            ((project as Record<string, unknown>).status as Record<string, unknown>).label
          )
        : 'Unknown';

    acc[statusLabel] = (acc[statusLabel] ?? 0) + 1;
    return acc;
  }, {});

  const projectSummaryItems = [
    `${selectedProjects.length} selected project${selectedProjects.length === 1 ? '' : 's'}`,
    ...Object.entries(statusCounts).map(
      ([statusLabel, count]) =>
        `${count} ${statusLabel.toLowerCase()} project${count === 1 ? '' : 's'}`
    ),
  ];

  return {
    organization: {
      title: 'Organization',
      items: [
        typeof organizationInformation?.organizationName === 'string'
          ? organizationInformation.organizationName
          : null,
        typeof organizationInformation?.titleRoleAtOrganization === 'string'
          ? organizationInformation.titleRoleAtOrganization
          : null,
      ].filter((value): value is string => Boolean(value)),
    },
    stakeholderType: {
      title: 'Stakeholder Type',
      items: [
        typeof stakeholderType?.label === 'string' ? stakeholderType.label : null,
        typeof organizationInformation?.cityRegionServed === 'string'
          ? organizationInformation.cityRegionServed
          : null,
      ].filter((value): value is string => Boolean(value)),
    },
    associatedProjects: {
      title: 'Associated Projects',
      items: projectSummaryItems,
    },
    visibilityLevel: {
      title: 'Visibility Level',
      items: ['Aggregate data only', 'Read-only access'],
    },
    impactGoals: {
      title: 'Impact Goals',
      items: getSelectedImpactGoalLabels(impactGoals),
    },
    whatHappensNext: {
      title: 'What Happens Next',
      items: [
        'Dashboard access is granted immediately',
        'Data refreshes automatically',
        'Reports are exportable for council or public use',
        'Audit logs are enabled by default',
      ],
    },
    certificationAccepted: reviewActivate?.certificationAccepted === true,
    activatedAt:
      typeof reviewActivate?.activatedAt === 'string' ? reviewActivate.activatedAt : null,
    activationNote:
      'Once activated, your dashboard access will reflect your selected programs and goals. Changes can be requested via support.',
    dashboardAccessGranted: reviewActivate?.certificationAccepted === true,
  };
}

async function ensureCommunityStepReady(user: any, requiredStep: string) {
  ensureCommunity(user);

  const state = await OnboardingState.findOne({ userId: user._id }).exec();
  if (state?.completedSteps?.includes(requiredStep)) {
    return state;
  }

  throw new AppError(
    `${requiredStep.replace(/_/g, ' ')} step is required before continuing`,
    400
  );
}

export async function createCommunityAccountFromInvite(
  input: CreateCommunityAccountInput
) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const existing = await User.findOne({ email: normalizedEmail }).lean().exec();
  if (existing) {
    throw new AppError('Email already registered', 409);
  }

  const invite = await assertCommunityRegistrationEligibility(
    input.onboardingToken,
    normalizedEmail
  );

  const passwordHash = await bcrypt.hash(input.password, 12);
  const prefillStakeholderType = tryResolveCommunityStakeholderType(
    invite.prefill.stakeholderType
  );
  const user = await User.create({
    email: normalizedEmail,
    phone:
      invite.prefill.phoneNumber?.trim() ||
      input.phone?.trim() ||
      undefined,
    passwordHash,
    role: invite.assignedRole,
    status: 'PENDING',
    oauthProviders: [],
    profile: {
      firstName: invite.prefill.firstName,
      lastName: invite.prefill.lastName,
      address: invite.prefill.cityOrRegionServed ?? undefined,
      communityStakeholder: {
        organizationName: invite.prefill.organizationName,
        stakeholderType:
          prefillStakeholderType ?? DEFAULT_COMMUNITY_STAKEHOLDER_TYPE,
        titleRoleAtOrganization: invite.prefill.titleOrRoleAtOrganization,
        cityRegionServed: invite.prefill.cityOrRegionServed ?? undefined,
      },
    },
  });

  try {
    await consumeCommunityInviteToken(
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
    organizationName: invite.prefill.organizationName,
    stakeholderType: invite.prefill.stakeholderType,
    titleOrRoleAtOrganization: invite.prefill.titleOrRoleAtOrganization,
    cityOrRegionServed: invite.prefill.cityOrRegionServed,
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
    action: 'COMMUNITY_ONBOARDING_ACCOUNT_CREATED',
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
      phone: user.phone ?? null,
      profile: user.profile ?? null,
    },
    stepKey: CREATE_ACCOUNT_STEP,
    completed: true,
    nextStep: 'verify_email',
    onboardingStatus: onboarding.status,
    onboarding,
  };
}

export async function saveCommunityOrganizationInformation(
  user: any,
  input: CommunityOrganizationInformationInput
) {
  const state = await ensureCommunityStepReady(user, CREATE_ACCOUNT_STEP);

  const payload = {
    organizationName: requireTrimmedString(
      input.organizationName,
      'organizationName'
    ),
    titleRoleAtOrganization: requireTrimmedString(
      input.titleRoleAtOrganization ?? input.role,
      'titleRoleAtOrganization'
    ),
    cityRegionServed: requireTrimmedString(
      input.cityRegionServed ?? input.jurisdiction,
      'cityRegionServed'
    ),
    phoneNumber: (() => {
      const phoneNumber =
        input.phoneNumber?.trim().replace(/\s/g, '') || user.phone?.trim() || '';
      if (!phoneNumber) {
        throw new AppError('phoneNumber is required', 400);
      }
      if (!e164PhoneRegex.test(phoneNumber)) {
        throw new AppError(
          'phoneNumber must be valid international format, e.g. +15551234567',
          400
        );
      }
      return phoneNumber;
    })(),
    department: input.department?.trim() || undefined,
  };

  state.role = user.role;
  state.stepData = {
    ...(state.stepData ?? {}),
    [ORGANIZATION_INFORMATION_STEP]: payload,
  };

  if (!state.completedSteps.includes(ORGANIZATION_INFORMATION_STEP)) {
    state.completedSteps.push(ORGANIZATION_INFORMATION_STEP);
  }

  state.status = 'IN_PROGRESS';
  state.updatedAt = new Date();
  await state.save();

  await syncCommunityStakeholderProfile(user._id as Types.ObjectId, {
    organizationName: payload.organizationName,
    titleRoleAtOrganization: payload.titleRoleAtOrganization,
    cityRegionServed: payload.cityRegionServed,
    phoneNumber: payload.phoneNumber,
  });

  const updatedUser = await User.findById(user._id).lean();

  await writeAuditEvent({
    actorUserId: user._id as Types.ObjectId,
    action: 'COMMUNITY_ORGANIZATION_INFORMATION_SUBMITTED',
    entityType: 'OnboardingState',
    entityId: user._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        stepKey: ORGANIZATION_INFORMATION_STEP,
        ...payload,
      },
    },
  });

  const onboarding = await evaluateOnboarding(updatedUser ?? user);

  return {
    message: 'Organization information saved successfully',
    stepKey: ORGANIZATION_INFORMATION_STEP,
    organizationInformation: payload,
    completed: true,
    nextStep: STAKEHOLDER_TYPE_STEP,
    onboardingStatus: onboarding.status,
    onboarding,
  };
}

export async function getCommunityOrganizationInformation(user: any) {
  const state = await ensureCommunityStepReady(user, CREATE_ACCOUNT_STEP);
  const payload = getStepData<Record<string, unknown>>(
    state,
    ORGANIZATION_INFORMATION_STEP
  );
  const createAccountData = getStepData<Record<string, unknown>>(
    state,
    CREATE_ACCOUNT_STEP
  );

  const organizationInformation =
    payload ?? {
      organizationName:
        typeof createAccountData?.organizationName === 'string'
          ? createAccountData.organizationName
          : user.profile?.communityStakeholder?.organizationName ?? null,
      titleRoleAtOrganization:
        typeof createAccountData?.titleOrRoleAtOrganization === 'string'
          ? createAccountData.titleOrRoleAtOrganization
          : user.profile?.communityStakeholder?.titleRoleAtOrganization ?? null,
      cityRegionServed:
        typeof createAccountData?.cityOrRegionServed === 'string'
          ? createAccountData.cityOrRegionServed
          : user.profile?.communityStakeholder?.cityRegionServed ??
            user.profile?.address ??
            null,
      phoneNumber: user.phone?.trim() || null,
      department: null,
    };

  return {
    stepKey: ORGANIZATION_INFORMATION_STEP,
    organizationInformation,
    completed: Boolean(
      state.completedSteps?.includes(ORGANIZATION_INFORMATION_STEP)
    ),
    nextStep: STAKEHOLDER_TYPE_STEP,
  };
}

export async function saveCommunityStakeholderType(
  user: any,
  input: CommunityStakeholderTypeInput
) {
  const state = await ensureCommunityStepReady(
    user,
    ORGANIZATION_INFORMATION_STEP
  );
  const stakeholderTypeKey = normalizeCommunityStakeholderType(
    input.stakeholderType
  );
  const selectedOption = getCommunityStakeholderTypeOption(stakeholderTypeKey);

  if (!selectedOption) {
    throw new AppError('stakeholderType is invalid', 400);
  }

  const payload = {
    stakeholderType: selectedOption.key,
    label: selectedOption.label,
    description: selectedOption.description,
  };

  state.role = user.role;
  state.stepData = {
    ...(state.stepData ?? {}),
    [STAKEHOLDER_TYPE_STEP]: payload,
  };

  if (!state.completedSteps.includes(STAKEHOLDER_TYPE_STEP)) {
    state.completedSteps.push(STAKEHOLDER_TYPE_STEP);
  }

  state.status = 'IN_PROGRESS';
  state.updatedAt = new Date();
  await state.save();

  await syncCommunityStakeholderProfile(user._id as Types.ObjectId, {
    stakeholderType: payload.stakeholderType,
  });

  await writeAuditEvent({
    actorUserId: user._id as Types.ObjectId,
    action: 'COMMUNITY_STAKEHOLDER_TYPE_SUBMITTED',
    entityType: 'OnboardingState',
    entityId: user._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        stepKey: STAKEHOLDER_TYPE_STEP,
        ...payload,
      },
    },
  });

  const onboarding = await evaluateOnboarding(user);

  return {
    message: 'Stakeholder type saved successfully',
    stepKey: STAKEHOLDER_TYPE_STEP,
    stakeholderType: payload,
    options: COMMUNITY_STAKEHOLDER_TYPE_OPTIONS,
    completed: true,
    nextStep: PROGRAM_ASSOCIATION_STEP,
    onboardingStatus: onboarding.status,
    onboarding,
  };
}

export async function getCommunityStakeholderType(user: any) {
  const state = await ensureCommunityStepReady(
    user,
    ORGANIZATION_INFORMATION_STEP
  );
  const payload = getStepData<Record<string, unknown>>(state, STAKEHOLDER_TYPE_STEP);
  const createAccountData = getStepData<Record<string, unknown>>(
    state,
    CREATE_ACCOUNT_STEP
  );

  const savedStakeholderType =
    typeof payload?.stakeholderType === 'string' ? payload.stakeholderType : null;
  const prefillStakeholderType = tryResolveCommunityStakeholderType(
    typeof createAccountData?.stakeholderType === 'string'
      ? createAccountData.stakeholderType
      : user.profile?.communityStakeholder?.stakeholderType ?? null
  );
  const selectedKey =
    savedStakeholderType ?? prefillStakeholderType ?? DEFAULT_COMMUNITY_STAKEHOLDER_TYPE;
  const selectedOption = selectedKey
    ? getCommunityStakeholderTypeOption(
        selectedKey as CommunityStakeholderTypeKey
      )
    : null;

  return {
    stepKey: STAKEHOLDER_TYPE_STEP,
    stakeholderType: selectedOption
      ? {
          stakeholderType: selectedOption.key,
          label: selectedOption.label,
          description: selectedOption.description,
        }
      : null,
    options: COMMUNITY_STAKEHOLDER_TYPE_OPTIONS,
    completed: Boolean(state.completedSteps?.includes(STAKEHOLDER_TYPE_STEP)),
    nextStep: PROGRAM_ASSOCIATION_STEP,
  };
}

export async function getCommunityStakeholderDashboardProfile(user: any) {
  ensureCommunity(user);

  const freshUser = await User.findById(user._id).lean().exec();
  if (!freshUser) {
    throw new AppError('User not found', 404);
  }

  const stored = freshUser.profile?.communityStakeholder;
  const hasStoredProfile = Boolean(
    stored?.stakeholderType ||
      stored?.organizationName ||
      stored?.titleRoleAtOrganization ||
      stored?.cityRegionServed
  );

  if (hasStoredProfile) {
    return {
      communityStakeholder: buildCommunityStakeholderProfileResponse(
        stored,
        freshUser.phone
      ),
    };
  }

  const state = await OnboardingState.findOne({ userId: user._id }).lean().exec();
  if (state) {
    const orgInfo = getStepData<Record<string, unknown>>(
      state,
      ORGANIZATION_INFORMATION_STEP
    );
    const stakeholderTypeData = getStepData<Record<string, unknown>>(
      state,
      STAKEHOLDER_TYPE_STEP
    );
    const createAccountData = getStepData<Record<string, unknown>>(
      state,
      CREATE_ACCOUNT_STEP
    );

    const fromOnboarding = {
      organizationName:
        typeof orgInfo?.organizationName === 'string'
          ? orgInfo.organizationName
          : typeof createAccountData?.organizationName === 'string'
            ? createAccountData.organizationName
            : undefined,
      stakeholderType:
        typeof stakeholderTypeData?.stakeholderType === 'string'
          ? stakeholderTypeData.stakeholderType
          : typeof createAccountData?.stakeholderType === 'string'
            ? createAccountData.stakeholderType
            : undefined,
      titleRoleAtOrganization:
        typeof orgInfo?.titleRoleAtOrganization === 'string'
          ? orgInfo.titleRoleAtOrganization
          : typeof createAccountData?.titleOrRoleAtOrganization === 'string'
            ? createAccountData.titleOrRoleAtOrganization
            : undefined,
      cityRegionServed:
        typeof orgInfo?.cityRegionServed === 'string'
          ? orgInfo.cityRegionServed
          : typeof createAccountData?.cityOrRegionServed === 'string'
            ? createAccountData.cityOrRegionServed
            : undefined,
    };

    const hasOnboardingProfile = Boolean(
      fromOnboarding.organizationName ||
        fromOnboarding.stakeholderType ||
        fromOnboarding.titleRoleAtOrganization ||
        fromOnboarding.cityRegionServed
    );

    if (hasOnboardingProfile) {
      const phoneNumber =
        typeof orgInfo?.phoneNumber === 'string' && orgInfo.phoneNumber.trim()
          ? orgInfo.phoneNumber.trim()
          : freshUser.phone?.trim() || undefined;

      await syncCommunityStakeholderProfile(user._id as Types.ObjectId, {
        organizationName: fromOnboarding.organizationName,
        stakeholderType: fromOnboarding.stakeholderType,
        titleRoleAtOrganization: fromOnboarding.titleRoleAtOrganization,
        cityRegionServed: fromOnboarding.cityRegionServed,
        phoneNumber,
      });

      return {
        communityStakeholder: buildCommunityStakeholderProfileResponse(
          fromOnboarding,
          phoneNumber ?? freshUser.phone
        ),
      };
    }
  }

  return {
    communityStakeholder: buildCommunityStakeholderProfileResponse(
      stored,
      freshUser.phone
    ),
  };
}

export async function saveCommunityProgramAssociation(
  user: any,
  input: CommunityProgramAssociationInput
) {
  const state = await ensureCommunityStepReady(user, STAKEHOLDER_TYPE_STEP);
  const projectIds = getProgramAssociationProjectIds(input);
  const oversightLevelKey = normalizeCommunityOversightLevel(input.oversightLevel);
  const oversightLevel = getCommunityOversightLevelOption(oversightLevelKey);

  if (!oversightLevel) {
    throw new AppError('oversightLevel is invalid', 400);
  }

  let selectedProjects: { id: string; projectName: string; location: string; programType: string; status: { code: string; label: string } }[] = [];
  if (projectIds.length > 0) {
    const projectDocs = await ProgramProjectModel.find({
      _id: { $in: projectIds.map((id) => new Types.ObjectId(id)) },
    })
      .lean()
      .exec();

    if (projectDocs.length !== projectIds.length) {
      throw new AppError('One or more selected projects could not be found', 404);
    }

    const projectsById = new Map(projectDocs.map((project) => [String(project._id), project]));
    selectedProjects = projectIds.map((id) => {
      const project = projectsById.get(id);
      if (!project) {
        throw new AppError('One or more selected projects could not be found', 404);
      }

      return {
        id,
        projectName: project.name,
        location: `${project.city}, ${project.state}`,
        programType: formatProgramProjectType(project.projectType),
        status: {
          code: project.status,
          label: formatProgramProjectStatus(project.status),
        },
      };
    });
  }

  const payload = {
    projectIds,
    selectedProjects,
    oversightLevel: {
      key: oversightLevel.key,
      label: oversightLevel.label,
      description: oversightLevel.description,
    },
  };

  state.role = user.role;
  state.stepData = {
    ...(state.stepData ?? {}),
    [PROGRAM_ASSOCIATION_STEP]: payload,
  };

  if (!state.completedSteps.includes(PROGRAM_ASSOCIATION_STEP)) {
    state.completedSteps.push(PROGRAM_ASSOCIATION_STEP);
  }

  state.status = 'IN_PROGRESS';
  state.updatedAt = new Date();
  await state.save();

  await writeAuditEvent({
    actorUserId: user._id as Types.ObjectId,
    action: 'COMMUNITY_PROGRAM_ASSOCIATION_SUBMITTED',
    entityType: 'OnboardingState',
    entityId: user._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        stepKey: PROGRAM_ASSOCIATION_STEP,
        projectIds,
        oversightLevel: oversightLevel.key,
      },
    },
  });

  const onboarding = await evaluateOnboarding(user);

  return {
    message: 'Program association saved successfully',
    stepKey: PROGRAM_ASSOCIATION_STEP,
    programAssociation: payload,
    availableProjects: await listCommunityProgramAssociationProjects(),
    oversightLevelOptions: COMMUNITY_OVERSIGHT_LEVEL_OPTIONS,
    completed: true,
    nextStep: DATA_VISIBILITY_PRIVACY_STEP,
    onboardingStatus: onboarding.status,
    onboarding,
  };
}

export async function getCommunityProgramAssociation(user: any) {
  const state = await ensureCommunityStepReady(user, STAKEHOLDER_TYPE_STEP);
  const payload = getStepData<Record<string, unknown>>(state, PROGRAM_ASSOCIATION_STEP);
  const projectOptions = await listCommunityProgramAssociationProjects();

  return {
    stepKey: PROGRAM_ASSOCIATION_STEP,
    programAssociation:
      payload ?? {
        projectIds: [],
        selectedProjects: [],
        oversightLevel: COMMUNITY_OVERSIGHT_LEVEL_OPTIONS[0],
      },
    availableProjects: projectOptions,
    oversightLevelOptions: COMMUNITY_OVERSIGHT_LEVEL_OPTIONS,
    completed: Boolean(state.completedSteps?.includes(PROGRAM_ASSOCIATION_STEP)),
    nextStep: DATA_VISIBILITY_PRIVACY_STEP,
  };
}

export async function saveCommunityDataVisibilityPrivacy(
  user: any,
  input: CommunityDataVisibilityPrivacyInput = {}
) {
  const state = await ensureCommunityStepReady(user, PROGRAM_ASSOCIATION_STEP);
  const acknowledgedVisibilityRules =
    input.acknowledgedVisibilityRules ?? input.reviewed ?? true;

  if (!acknowledgedVisibilityRules) {
    throw new AppError(
      'You must acknowledge the visibility and privacy rules to continue',
      400
    );
  }

  const savedPayload = {
    acknowledgedVisibilityRules: true,
    reviewedAt: new Date().toISOString(),
  };

  state.role = user.role;
  state.stepData = {
    ...(state.stepData ?? {}),
    [DATA_VISIBILITY_PRIVACY_STEP]: savedPayload,
  };

  if (!state.completedSteps.includes(DATA_VISIBILITY_PRIVACY_STEP)) {
    state.completedSteps.push(DATA_VISIBILITY_PRIVACY_STEP);
  }

  state.status = 'IN_PROGRESS';
  state.updatedAt = new Date();
  await state.save();

  await writeAuditEvent({
    actorUserId: user._id as Types.ObjectId,
    action: 'COMMUNITY_DATA_VISIBILITY_PRIVACY_REVIEWED',
    entityType: 'OnboardingState',
    entityId: user._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        stepKey: DATA_VISIBILITY_PRIVACY_STEP,
        acknowledgedVisibilityRules: true,
      },
    },
  });

  const onboarding = await evaluateOnboarding(user);
  const programAssociation = getStepData<Record<string, unknown>>(
    state,
    PROGRAM_ASSOCIATION_STEP
  );

  return {
    message: 'Data visibility and privacy reviewed successfully',
    stepKey: DATA_VISIBILITY_PRIVACY_STEP,
    dataVisibilityPrivacy: buildCommunityDataVisibilityPrivacyPayload(
      programAssociation,
      savedPayload
    ),
    completed: true,
    nextStep: IMPACT_GOALS_STEP,
    onboardingStatus: onboarding.status,
    onboarding,
  };
}

export async function getCommunityDataVisibilityPrivacy(user: any) {
  const state = await ensureCommunityStepReady(user, PROGRAM_ASSOCIATION_STEP);
  const programAssociation = getStepData<Record<string, unknown>>(
    state,
    PROGRAM_ASSOCIATION_STEP
  );
  const savedPayload = getStepData<Record<string, unknown>>(
    state,
    DATA_VISIBILITY_PRIVACY_STEP
  );

  return {
    stepKey: DATA_VISIBILITY_PRIVACY_STEP,
    dataVisibilityPrivacy: buildCommunityDataVisibilityPrivacyPayload(
      programAssociation,
      savedPayload
    ),
    completed: Boolean(
      state.completedSteps?.includes(DATA_VISIBILITY_PRIVACY_STEP)
    ),
    nextStep: IMPACT_GOALS_STEP,
  };
}

export async function saveCommunityImpactGoals(
  user: any,
  input: CommunityImpactGoalsInput
) {
  const state = await ensureCommunityStepReady(user, DATA_VISIBILITY_PRIVACY_STEP);
  const goalValues = input.impactGoals ?? input.selectedImpactGoals ?? input.goals;
  const impactGoalKeys = normalizeCommunityImpactGoalKeys(goalValues);
  const selectedGoals = COMMUNITY_IMPACT_GOAL_OPTIONS.filter((option) =>
    impactGoalKeys.includes(option.key)
  );
  const acknowledgedOversightAccessAndExitRules =
    input.acknowledgedOversightAccessAndExitRules === true;

  if (!acknowledgedOversightAccessAndExitRules) {
    throw new AppError(
      'You must acknowledge the oversight access and exit rules to continue',
      400
    );
  }

  const savedPayload = {
    impactGoalKeys,
    selectedGoals,
    acknowledgedOversightAccessAndExitRules: true,
    reviewedAt: new Date().toISOString(),
  };

  state.role = user.role;
  state.stepData = {
    ...(state.stepData ?? {}),
    [IMPACT_GOALS_STEP]: savedPayload,
  };

  if (!state.completedSteps.includes(IMPACT_GOALS_STEP)) {
    state.completedSteps.push(IMPACT_GOALS_STEP);
  }

  state.status = 'IN_PROGRESS';
  state.updatedAt = new Date();
  await state.save();

  await writeAuditEvent({
    actorUserId: user._id as Types.ObjectId,
    action: 'COMMUNITY_IMPACT_GOALS_SUBMITTED',
    entityType: 'OnboardingState',
    entityId: user._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        stepKey: IMPACT_GOALS_STEP,
        impactGoalKeys,
      },
    },
  });

  const onboarding = await evaluateOnboarding(user);

  return {
    message: 'Impact goals saved successfully',
    stepKey: IMPACT_GOALS_STEP,
    impactGoals: buildCommunityImpactGoalsPayload(savedPayload),
    completed: true,
    nextStep: REVIEW_ACTIVATE_STEP,
    onboardingStatus: onboarding.status,
    onboarding,
  };
}

export async function getCommunityImpactGoals(user: any) {
  const state = await ensureCommunityStepReady(user, DATA_VISIBILITY_PRIVACY_STEP);
  const savedPayload = getStepData<Record<string, unknown>>(state, IMPACT_GOALS_STEP);

  return {
    stepKey: IMPACT_GOALS_STEP,
    impactGoals: buildCommunityImpactGoalsPayload(savedPayload),
    completed: Boolean(state.completedSteps?.includes(IMPACT_GOALS_STEP)),
    nextStep: REVIEW_ACTIVATE_STEP,
  };
}

async function promoteCommunityOnboardingToDomainCollections(
  user: any,
  stepData: Record<string, unknown>
): Promise<void> {
  const orgInfo = (stepData[ORGANIZATION_INFORMATION_STEP] ?? {}) as Record<string, unknown>;
  const createAccountData = (stepData[CREATE_ACCOUNT_STEP] ?? {}) as Record<string, unknown>;

  const orgName =
    typeof orgInfo.organizationName === 'string' && orgInfo.organizationName.trim()
      ? orgInfo.organizationName.trim()
      : typeof createAccountData.organizationName === 'string' && createAccountData.organizationName.trim()
        ? createAccountData.organizationName.trim()
        : `${user.profile?.firstName ?? ''} ${user.profile?.lastName ?? ''}`.trim() || user.email;

  // Idempotent: reuse existing org for this community user
  let org = await Organization.findOne({ primaryContactUserId: user._id }).exec();
  if (!org) {
    org = await Organization.create({
      type: 'COMMUNITY_ORG',
      name: orgName,
      primaryContactUserId: user._id,
    });
  }

  // Idempotent: upsert membership so running review_activate twice is safe
  await Membership.findOneAndUpdate(
    { userId: user._id, orgId: org._id },
    { $set: { roleInOrg: 'OWNER', status: 'active' } },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

export async function saveCommunityReviewActivate(
  user: any,
  input: CommunityReviewActivateInput
) {
  const state = await ensureCommunityStepReady(user, IMPACT_GOALS_STEP);
  const certificationAccepted =
    input.certificationAccepted === true ||
    input.authorizedAccessCertification === true ||
    input.certifyAndActivate === true ||
    input.confirmActivate === true;

  if (!certificationAccepted) {
    throw new AppError(
      'You must certify the review details before activation',
      400
    );
  }

  const savedPayload = {
    certificationAccepted: true,
    activatedAt: new Date().toISOString(),
  };

  state.role = user.role;
  state.stepData = {
    ...(state.stepData ?? {}),
    [REVIEW_ACTIVATE_STEP]: savedPayload,
  };

  if (!state.completedSteps.includes(REVIEW_ACTIVATE_STEP)) {
    state.completedSteps.push(REVIEW_ACTIVATE_STEP);
  }

  state.status = 'COMPLETE';
  state.updatedAt = new Date();
  await state.save();

  await User.findByIdAndUpdate(user._id, { $set: { status: 'ACTIVE' } }).exec();

  const orgInfo = getStepData<Record<string, unknown>>(state, ORGANIZATION_INFORMATION_STEP);
  const stakeholderTypeData = getStepData<Record<string, unknown>>(state, STAKEHOLDER_TYPE_STEP);
  const createAccountData = getStepData<Record<string, unknown>>(state, CREATE_ACCOUNT_STEP);

  await syncCommunityStakeholderProfile(user._id as Types.ObjectId, {
    organizationName:
      typeof orgInfo?.organizationName === 'string'
        ? orgInfo.organizationName
        : typeof createAccountData?.organizationName === 'string'
          ? createAccountData.organizationName
          : undefined,
    stakeholderType:
      typeof stakeholderTypeData?.stakeholderType === 'string'
        ? stakeholderTypeData.stakeholderType
        : typeof createAccountData?.stakeholderType === 'string'
          ? createAccountData.stakeholderType
          : undefined,
    titleRoleAtOrganization:
      typeof orgInfo?.titleRoleAtOrganization === 'string'
        ? orgInfo.titleRoleAtOrganization
        : typeof createAccountData?.titleOrRoleAtOrganization === 'string'
          ? createAccountData.titleOrRoleAtOrganization
          : undefined,
    cityRegionServed:
      typeof orgInfo?.cityRegionServed === 'string'
        ? orgInfo.cityRegionServed
        : typeof createAccountData?.cityOrRegionServed === 'string'
          ? createAccountData.cityOrRegionServed
          : undefined,
    phoneNumber:
      typeof orgInfo?.phoneNumber === 'string'
        ? orgInfo.phoneNumber
        : typeof user.phone === 'string'
          ? user.phone
          : undefined,
  });

  await promoteCommunityOnboardingToDomainCollections(user, state.stepData as Record<string, unknown>);

  await writeAuditEvent({
    actorUserId: user._id as Types.ObjectId,
    action: 'COMMUNITY_ONBOARDING_ACTIVATED',
    entityType: 'OnboardingState',
    entityId: user._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        stepKey: REVIEW_ACTIVATE_STEP,
        certificationAccepted: true,
      },
    },
  });

  const onboarding = await evaluateOnboarding(user);
  const refreshedState = await OnboardingState.findOne({ userId: user._id }).lean().exec();

  return {
    message: 'Community onboarding activated successfully',
    stepKey: REVIEW_ACTIVATE_STEP,
    reviewActivate: buildCommunityReviewActivatePayload(refreshedState ?? state),
    completed: true,
    nextStep: null,
    dashboardAccessGranted: true,
    onboardingStatus: onboarding.status,
    onboarding,
  };
}

export async function getCommunityReviewActivate(user: any) {
  const state = await ensureCommunityStepReady(user, IMPACT_GOALS_STEP);

  return {
    stepKey: REVIEW_ACTIVATE_STEP,
    reviewActivate: buildCommunityReviewActivatePayload(state),
    completed: Boolean(state.completedSteps?.includes(REVIEW_ACTIVATE_STEP)),
    nextStep: null,
  };
}
