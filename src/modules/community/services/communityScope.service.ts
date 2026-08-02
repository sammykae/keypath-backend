import { Types } from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { User } from '../../auth/models/user.model';
import { OnboardingState } from '../../onboarding/models/onboarding-state.model';
import {
  buildCommunityStakeholderProfileResponse,
  resolveCommunityStakeholderType,
} from '../../onboarding/constants/community-stakeholder-types';
import { resolveCommunityDashboardConfigKey } from '../constants/resolveCommunityDashboardConfig';
import type { CommunityDashboardScope } from '../types/communityDashboard.types';

const PROGRAM_ASSOCIATION_STEP = 'program_association';
const ORGANIZATION_INFORMATION_STEP = 'organization_information';
const STAKEHOLDER_TYPE_STEP = 'stakeholder_type';
const CREATE_ACCOUNT_STEP = 'create_account';

function getStepData<T = Record<string, unknown>>(state: any, stepKey: string) {
  const stepData = (state?.stepData ?? {}) as Record<string, unknown>;
  return (stepData[stepKey] as T | undefined) ?? null;
}

function getProgramAssociationProjectIds(state: any): string[] {
  const programData = getStepData<Record<string, unknown>>(state, PROGRAM_ASSOCIATION_STEP);
  if (!programData) return [];

  const raw =
    programData.projectIds ??
    programData.selectedProjectIds ??
    programData.programProjectIds;

  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
}

async function resolveStakeholderProfile(userId: Types.ObjectId) {
  const freshUser = await User.findById(userId).lean().exec();
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
    return buildCommunityStakeholderProfileResponse(stored, freshUser.phone);
  }

  const state = await OnboardingState.findOne({ userId }).lean().exec();
  if (!state) {
    return buildCommunityStakeholderProfileResponse(null, freshUser.phone);
  }

  const orgInfo = getStepData<Record<string, unknown>>(state, ORGANIZATION_INFORMATION_STEP);
  const stakeholderTypeData = getStepData<Record<string, unknown>>(state, STAKEHOLDER_TYPE_STEP);
  const createAccountData = getStepData<Record<string, unknown>>(state, CREATE_ACCOUNT_STEP);

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

  return buildCommunityStakeholderProfileResponse(fromOnboarding, freshUser.phone);
}

export async function resolveCommunityDashboardScope(
  userId: Types.ObjectId
): Promise<CommunityDashboardScope> {
  const profile = await resolveStakeholderProfile(userId);
  const stakeholderType = resolveCommunityStakeholderType(profile.stakeholderType);
  const configKey = resolveCommunityDashboardConfigKey(stakeholderType);

  const state = await OnboardingState.findOne({ userId }).lean().exec();
  const projectIds = state ? getProgramAssociationProjectIds(state) : [];

  return {
    userId,
    stakeholderType,
    stakeholderTypeLabel: profile.stakeholderTypeLabel,
    organizationName: profile.organizationName,
    configKey,
    projectIds,
  };
}
