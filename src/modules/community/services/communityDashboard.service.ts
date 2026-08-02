import { resolveCommunityDashboardScope } from './communityScope.service';
import { getCommunityDashboardSeed } from '../data/communityDashboardSeedData';
import {
  getCommunityMessagesAuditWithRuntime
} from './communityDashboardActions.service';
import { communityDashboardConfig } from '../constants/communityDashboardConfig';
import { resolveCommunityDashboardConfig } from '../constants/resolveCommunityDashboardConfig';
import type {
  CommunityComplianceIssuesResponse,
  CommunityComplianceResponse,
  CommunityDashboardProfileResponse,
  CommunityEconomicImpactResponse,
  CommunityFiscalImpactResponse,
  CommunityGetHelpResponse,
  CommunityHousingProjectsResponse,
  CommunityMessagesAuditResponse,
  CommunityOverviewResponse,
  CommunityProgramsResponse,
  CommunityProjectMetricsResponse,
  CommunityPublicCommitmentsResponse,
  CommunityReportsResponse,
  CommunityStakeholderTypeConfigResponse,
  CommunityTenantParticipationResponse,
} from '../types/communityDashboard.types';
import { Types } from 'mongoose';

async function getScope(userId: Types.ObjectId) {
  return resolveCommunityDashboardScope(userId);
}

export async function getCommunityDashboardProfile(
  userId: Types.ObjectId
): Promise<CommunityDashboardProfileResponse> {
  const scope = await getScope(userId);
  return {
    stakeholderType: scope.stakeholderType,
    stakeholderTypeLabel: scope.stakeholderTypeLabel,
    organizationName: scope.organizationName ?? undefined,
    configKey: scope.configKey,
  };
}

export async function getCommunityStakeholderTypeConfig(
  userId: Types.ObjectId
): Promise<CommunityStakeholderTypeConfigResponse> {
  const scope = await getScope(userId);
  const { config } = resolveCommunityDashboardConfig(scope.stakeholderType);

  return {
    configKey: scope.configKey,
    stakeholderType: scope.stakeholderType,
    stakeholderTypeLabel: scope.stakeholderTypeLabel,
    primaryMetrics: config.primaryMetrics,
    defaultPage: config.defaultPage,
    pageTitle: config.pageTitle,
    portfolioLabel: config.portfolioLabel,
    toolbarLabels: config.toolbarLabels,
    sidebarLabels: config.sidebarLabels,
    terminology: config.terminology,
  };
}

export async function getCommunityPrograms(
  userId: Types.ObjectId
): Promise<CommunityProgramsResponse> {
  const scope = await getScope(userId);
  const seed = getCommunityDashboardSeed(scope.configKey);
  const config = communityDashboardConfig[scope.configKey];

  return {
    kpiCards: seed.programs.kpiCards,
    primaryMetrics: config.primaryMetrics,
  };
}

export async function getCommunityOverview(
  userId: Types.ObjectId
): Promise<CommunityOverviewResponse> {
  const scope = await getScope(userId);
  const seed = getCommunityDashboardSeed(scope.configKey);
  const config = communityDashboardConfig[scope.configKey];

  return {
    kpiCards: seed.programs.kpiCards,
    primaryMetrics: config.primaryMetrics,
    sparklineData: seed.overview.sparklineData,
    healthStatuses: seed.overview.healthStatuses,
    healthSummaryTitle: config.dashboardCopy.healthSummaryTitle,
    healthSummaryLines: config.dashboardCopy.healthSummaryLines,
  };
}

export async function getCommunityProjectMetrics(
  userId: Types.ObjectId
): Promise<CommunityProjectMetricsResponse> {
  const scope = await getScope(userId);
  const seed = getCommunityDashboardSeed(scope.configKey);
  const config = communityDashboardConfig[scope.configKey];

  return {
    metrics: seed.programs.kpiCards,
    primaryMetrics: config.primaryMetrics,
  };
}

export async function getCommunityHousingProjects(
  userId: Types.ObjectId
): Promise<CommunityHousingProjectsResponse> {
  const scope = await getScope(userId);
  const seed = getCommunityDashboardSeed(scope.configKey);

  return {
    ...seed.housingProjects,
    pageContent: seed.pageContent.projects,
  };
}

export async function getCommunityFiscalImpact(
  userId: Types.ObjectId
): Promise<CommunityFiscalImpactResponse> {
  const scope = await getScope(userId);
  const seed = getCommunityDashboardSeed(scope.configKey);
  const { fiscalImpact } = seed.pageContent;

  return {
    kpiCards: fiscalImpact.kpiCards,
    activityBars: seed.fiscalImpact.activityBars,
    estimates: seed.fiscalImpact.estimates,
    bottomMetrics: fiscalImpact.bottomMetrics,
    economicActivityTitle: fiscalImpact.economicActivityTitle,
    publicBenefitTitle: fiscalImpact.publicBenefitTitle,
  };
}

export async function getCommunityEconomicImpact(
  userId: Types.ObjectId
): Promise<CommunityEconomicImpactResponse> {
  const scope = await getScope(userId);
  const seed = getCommunityDashboardSeed(scope.configKey);

  return {
    localSpendBreakdown: seed.economicImpact.localSpendBreakdown,
    pageContent: seed.pageContent.economicImpact,
  };
}

export async function getCommunityTenantParticipation(
  userId: Types.ObjectId
): Promise<CommunityTenantParticipationResponse> {
  const scope = await getScope(userId);
  const seed = getCommunityDashboardSeed(scope.configKey);

  return {
    ...seed.tenantParticipation,
    pageContent: seed.pageContent.tenantParticipation,
  };
}

export async function getCommunityCompliance(
  userId: Types.ObjectId
): Promise<CommunityComplianceResponse> {
  const scope = await getScope(userId);
  return getCommunityDashboardSeed(scope.configKey).pageContent.compliance;
}

export async function getCommunityPublicCommitments(
  userId: Types.ObjectId
): Promise<CommunityPublicCommitmentsResponse> {
  const scope = await getScope(userId);
  const compliance = getCommunityDashboardSeed(scope.configKey).pageContent.compliance;

  return {
    commitments: compliance.pledgeRows,
    overviewTitle: compliance.overviewTitle,
    pledgeTableTitle: compliance.pledgeTableTitle,
  };
}

export async function getCommunityComplianceIssues(
  userId: Types.ObjectId
): Promise<CommunityComplianceIssuesResponse> {
  const scope = await getScope(userId);
  const seed = getCommunityDashboardSeed(scope.configKey);

  return {
    issues: seed.housingProjects.riskFlags,
    overviewItems: seed.pageContent.compliance.overviewItems,
  };
}

export async function getCommunityReports(
  userId: Types.ObjectId
): Promise<CommunityReportsResponse> {
  const scope = await getScope(userId);
  const { programs } = getCommunityDashboardSeed(scope.configKey);

  return {
    reportItems: programs.reportItems,
    briefGenerator: programs.briefGenerator,
  };
}

export async function getCommunityMessagesAudit(
  userId: Types.ObjectId
): Promise<CommunityMessagesAuditResponse> {
  return getCommunityMessagesAuditWithRuntime(userId);
}

export async function getCommunityMessages(userId: Types.ObjectId) {
  const scope = await getScope(userId);
  return { messages: getCommunityDashboardSeed(scope.configKey).messages };
}

export async function getCommunityAuditTrail(userId: Types.ObjectId) {
  const data = await getCommunityMessagesAuditWithRuntime(userId);
  return { auditTrail: data.auditTrail };
}

export async function getCommunityGetHelp(
  userId: Types.ObjectId
): Promise<CommunityGetHelpResponse> {
  const scope = await getScope(userId);
  return {
    description: getCommunityDashboardSeed(scope.configKey).pageContent.getHelpDescription,
  };
}
