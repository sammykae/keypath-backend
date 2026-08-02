import {
  communityDashboardConfig,
  DEFAULT_COMMUNITY_DASHBOARD_CONFIG_KEY,
  type CommunityDashboardConfigKey,
  type CommunityStakeholderDashboardConfig,
} from './communityDashboardConfig';
import { communityDashboardPageContent } from '../data/communityDashboardPageSeed';
import type { CommunityDashboardPageContent } from '../data/communityDashboardPageSeed';

export type CommunityDashboardFullConfig = CommunityStakeholderDashboardConfig & {
  pages: CommunityDashboardPageContent;
};

const STAKEHOLDER_TYPE_TO_CONFIG_KEY: Record<string, CommunityDashboardConfigKey> = {
  MUNICIPALITY_CITY_AGENCY: 'municipality',
  HOUSING_AUTHORITY: 'housingAuthority',
  LAND_AUTHORITY: 'landAuthority',
  UNIVERSITY_SCHOOL: 'university',
  FAITH_BASED_ORGANIZATION: 'faithBased',
  NONPROFIT: 'nonprofit',
  OTHER: 'other',
  municipality: 'municipality',
  'housing-authority': 'housingAuthority',
  'land-authority': 'landAuthority',
  university: 'university',
  'faith-based': 'faithBased',
  nonprofit: 'nonprofit',
  other: 'other',
};

export function resolveCommunityDashboardConfigKey(
  stakeholderType?: string | null
): CommunityDashboardConfigKey {
  if (!stakeholderType) {
    return DEFAULT_COMMUNITY_DASHBOARD_CONFIG_KEY;
  }

  return (
    STAKEHOLDER_TYPE_TO_CONFIG_KEY[stakeholderType] ??
    STAKEHOLDER_TYPE_TO_CONFIG_KEY[stakeholderType.toUpperCase()] ??
    DEFAULT_COMMUNITY_DASHBOARD_CONFIG_KEY
  );
}

export function resolveCommunityDashboardConfig(stakeholderType?: string | null): {
  configKey: CommunityDashboardConfigKey;
  config: CommunityDashboardFullConfig;
} {
  const configKey = resolveCommunityDashboardConfigKey(stakeholderType);
  const config: CommunityDashboardFullConfig = {
    ...communityDashboardConfig[configKey],
    pages: communityDashboardPageContent[configKey],
  };

  return { configKey, config };
}
