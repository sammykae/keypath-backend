import type { Types } from 'mongoose';
import type {
  CommunityDashboardConfigKey,
  CommunityDashboardKpiCard,
  CommunityDashboardReportItem,
} from '../constants/communityDashboardConfig';
import type { CommunityDashboardPageContent } from '../data/communityDashboardPageSeed';
import type {
  CommunityAuditTrailEvent,
  CommunityOverviewHealthStatus,
  CommunityStakeholderMessage,
  FiscalActivityBar,
  FiscalImpactEstimates,
  HousingProjectBudget,
  HousingProjectDetail,
  HousingProjectRiskFlag,
  HousingProjectRow,
  LocalSpendBreakdown,
  SparklinePoint,
  TenantEconomicValuePoint,
  TenantParticipationCohort,
  TenantParticipationEconomicMetrics,
  TenantParticipationGrowthPoint,
} from '../data/communityDashboardSeedData';

export type CommunityDashboardScope = {
  userId: Types.ObjectId;
  stakeholderType: string;
  stakeholderTypeLabel: string;
  organizationName?: string | null;
  configKey: CommunityDashboardConfigKey;
  projectIds: string[];
};

export type CommunityDashboardProfileResponse = {
  stakeholderType: string;
  stakeholderTypeLabel: string;
  organizationName?: string;
  configKey: CommunityDashboardConfigKey;
};

export type CommunityStakeholderTypeConfigResponse = {
  configKey: CommunityDashboardConfigKey;
  stakeholderType: string;
  stakeholderTypeLabel: string;
  primaryMetrics: string[];
  defaultPage: string;
  pageTitle: string;
  portfolioLabel: string;
  toolbarLabels: {
    exportReport: string;
    aiInsights: string;
  };
  sidebarLabels: {
    overview: string;
    projects: string;
    economicImpact: string;
    fiscalImpact: string;
    tenantParticipation: string;
    compliance: string;
    reports: string;
    messages: string;
  };
  terminology: {
    program: string;
    tenants: string;
    compliance: string;
    portfolio: string;
  };
};

export type CommunityProgramsResponse = {
  kpiCards: CommunityDashboardKpiCard[];
  primaryMetrics: string[];
};

export type CommunityOverviewResponse = CommunityProgramsResponse & {
  sparklineData: SparklinePoint[];
  healthStatuses: CommunityOverviewHealthStatus;
  healthSummaryTitle: string;
  healthSummaryLines: string[];
};

export type CommunityHousingProjectsResponse = {
  projects: HousingProjectRow[];
  featuredProject: HousingProjectDetail;
  budget: HousingProjectBudget;
  riskFlags: HousingProjectRiskFlag[];
  pageContent: CommunityDashboardPageContent['projects'];
};

export type CommunityFiscalImpactResponse = {
  kpiCards: CommunityDashboardKpiCard[];
  activityBars: FiscalActivityBar[];
  estimates: FiscalImpactEstimates;
  bottomMetrics: { label: string; value: string }[];
  economicActivityTitle: string;
  publicBenefitTitle: string;
};

export type CommunityEconomicImpactResponse = {
  localSpendBreakdown: LocalSpendBreakdown;
  pageContent: CommunityDashboardPageContent['economicImpact'];
};

export type CommunityTenantParticipationResponse = {
  growthData: TenantParticipationGrowthPoint[];
  economicValueData: TenantEconomicValuePoint[];
  cohorts: TenantParticipationCohort[];
  economicMetrics: TenantParticipationEconomicMetrics;
  pageContent: CommunityDashboardPageContent['tenantParticipation'];
};

export type CommunityComplianceResponse = CommunityDashboardPageContent['compliance'];

export type CommunityReportsResponse = {
  reportItems: CommunityDashboardReportItem[];
  briefGenerator?: { title: string; description: string };
};

export type CommunityMessagesAuditResponse = {
  messages: CommunityStakeholderMessage[];
  auditTrail: CommunityAuditTrailEvent[];
};

export type CommunityGetHelpResponse = {
  description: string;
};

export type CommunityProjectMetricsResponse = {
  metrics: CommunityDashboardKpiCard[];
  primaryMetrics: string[];
};

export type CommunityPublicCommitmentsResponse = {
  commitments: CommunityDashboardPageContent['compliance']['pledgeRows'];
  overviewTitle: string;
  pledgeTableTitle: string;
};

export type CommunityComplianceIssuesResponse = {
  issues: HousingProjectRiskFlag[];
  overviewItems: CommunityDashboardPageContent['compliance']['overviewItems'];
};
