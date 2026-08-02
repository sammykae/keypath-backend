export type CommunityDashboardConfigKey =
  | 'municipality'
  | 'housingAuthority'
  | 'landAuthority'
  | 'university'
  | 'faithBased'
  | 'nonprofit'
  | 'other'

export type CommunityDashboardMetricKey = string

export type CommunityDashboardKpiCard = {
  key: CommunityDashboardMetricKey
  title: string
  value: string
  subtitle: string
}

export type CommunityDashboardReportItem = {
  title: string
  description: string
}

import {
  buildCommunitySidebarLabels,
  COMMUNITY_GLOBAL_SIDEBAR_LABELS,
  COMMUNITY_PORTFOLIO_LABEL,
  COMMUNITY_TOOLBAR_LABELS
} from './communityDashboardLabels'

export type CommunityStakeholderDashboardConfig = {
  primaryMetrics: CommunityDashboardMetricKey[]
  defaultPage: string
  pageTitle: string
  portfolioLabel: string
  toolbarLabels: {
    exportReport: string
    aiInsights: string
  }
  sidebarLabels: {
    overview: string
    projects: string
    economicImpact: string
    fiscalImpact: string
    tenantParticipation: string
    compliance: string
    reports: string
    messages: string
  }
  dashboardCopy: {
    healthSummaryTitle: string
    healthSummaryLines: string[]
  }
  terminology: {
    program: string
    tenants: string
    compliance: string
    portfolio: string
  }
}

export const communityDashboardConfig: Record<
  CommunityDashboardConfigKey,
  CommunityStakeholderDashboardConfig
> = {
  municipality: {
    primaryMetrics: ['taxBaseUplift', 'jobsCreated', 'localSpend', 'complianceStatus'],
    defaultPage: COMMUNITY_GLOBAL_SIDEBAR_LABELS.overview,
    pageTitle: COMMUNITY_GLOBAL_SIDEBAR_LABELS.overview,
    portfolioLabel: COMMUNITY_PORTFOLIO_LABEL,
    toolbarLabels: COMMUNITY_TOOLBAR_LABELS,
    sidebarLabels: buildCommunitySidebarLabels('municipality'),
    dashboardCopy: {
      healthSummaryTitle: 'Community Impact Summary',
      healthSummaryLines: [
        'Tax base and local economic indicators remain within approved thresholds.',
        'Vendor participation and job creation metrics are tracking to plan.',
        'No unresolved commitment violations are currently flagged.'
      ]
    },
    terminology: {
      program: 'municipal housing program',
      tenants: 'residents',
      compliance: 'public accountability',
      portfolio: 'city program portfolio'
    }
  },
  housingAuthority: {
    primaryMetrics: [
      'affordableUnits',
      'tenantParticipation',
      'housingStability',
      'occupancy'
    ],
    defaultPage: COMMUNITY_GLOBAL_SIDEBAR_LABELS.overview,
    pageTitle: COMMUNITY_GLOBAL_SIDEBAR_LABELS.overview,
    portfolioLabel: COMMUNITY_PORTFOLIO_LABEL,
    toolbarLabels: COMMUNITY_TOOLBAR_LABELS,
    sidebarLabels: buildCommunitySidebarLabels('housingAuthority'),
    dashboardCopy: {
      healthSummaryTitle: 'Community Impact Summary',
      healthSummaryLines: [
        'Affordable unit delivery remains on schedule across monitored properties.',
        'Tenant equity and rewards participation indicators are stable.',
        'Occupancy levels are within target ranges for monitored programs.'
      ]
    },
    terminology: {
      program: 'affordable housing program',
      tenants: 'residents',
      compliance: 'housing commitments',
      portfolio: 'housing program portfolio'
    }
  },
  landAuthority: {
    primaryMetrics: [
      'landProjects',
      'unitsDelivered',
      'developerCompliance',
      'publicLandValue'
    ],
    defaultPage: COMMUNITY_GLOBAL_SIDEBAR_LABELS.overview,
    pageTitle: COMMUNITY_GLOBAL_SIDEBAR_LABELS.overview,
    portfolioLabel: COMMUNITY_PORTFOLIO_LABEL,
    toolbarLabels: COMMUNITY_TOOLBAR_LABELS,
    sidebarLabels: buildCommunitySidebarLabels('landAuthority'),
    dashboardCopy: {
      healthSummaryTitle: 'Community Impact Summary',
      healthSummaryLines: [
        'Active land disposition projects are progressing within approved timelines.',
        'Developer commitments are being met across monitored sites.',
        'Public land value and community benefit metrics are tracking as planned.'
      ]
    },
    terminology: {
      program: 'land disposition program',
      tenants: 'community beneficiaries',
      compliance: 'developer commitments',
      portfolio: 'land program portfolio'
    }
  },
  university: {
    primaryMetrics: [
      'studentHousingUnits',
      'workforceHousingUnits',
      'occupancy',
      'projectStatus'
    ],
    defaultPage: COMMUNITY_GLOBAL_SIDEBAR_LABELS.overview,
    pageTitle: COMMUNITY_GLOBAL_SIDEBAR_LABELS.overview,
    portfolioLabel: COMMUNITY_PORTFOLIO_LABEL,
    toolbarLabels: COMMUNITY_TOOLBAR_LABELS,
    sidebarLabels: buildCommunitySidebarLabels('university'),
    dashboardCopy: {
      healthSummaryTitle: 'Community Impact Summary',
      healthSummaryLines: [
        'Student and workforce housing projects remain within approved timelines.',
        'Occupancy across campus-linked housing is stable.',
        'Partnership developments are meeting institutional reporting requirements.'
      ]
    },
    terminology: {
      program: 'campus housing program',
      tenants: 'students and workforce residents',
      compliance: 'institutional commitments',
      portfolio: 'campus program portfolio'
    }
  },
  faithBased: {
    primaryMetrics: [
      'communityBenefit',
      'housingUnitsCreated',
      'tenantStability',
      'missionImpact'
    ],
    defaultPage: COMMUNITY_GLOBAL_SIDEBAR_LABELS.overview,
    pageTitle: COMMUNITY_GLOBAL_SIDEBAR_LABELS.overview,
    portfolioLabel: COMMUNITY_PORTFOLIO_LABEL,
    toolbarLabels: COMMUNITY_TOOLBAR_LABELS,
    sidebarLabels: buildCommunitySidebarLabels('faithBased'),
    dashboardCopy: {
      healthSummaryTitle: 'Community Impact Summary',
      healthSummaryLines: [
        'Housing ministry projects are delivering planned community benefit.',
        'Resident stability and mission-aligned outcomes remain strong.',
        'Stewardship commitments are being met across active programs.'
      ]
    },
    terminology: {
      program: 'housing ministry program',
      tenants: 'community members',
      compliance: 'stewardship commitments',
      portfolio: 'ministry program portfolio'
    }
  },
  nonprofit: {
    primaryMetrics: [
      'residentOutcomes',
      'affordability',
      'tenantStability',
      'programParticipation'
    ],
    defaultPage: COMMUNITY_GLOBAL_SIDEBAR_LABELS.overview,
    pageTitle: COMMUNITY_GLOBAL_SIDEBAR_LABELS.overview,
    portfolioLabel: COMMUNITY_PORTFOLIO_LABEL,
    toolbarLabels: COMMUNITY_TOOLBAR_LABELS,
    sidebarLabels: buildCommunitySidebarLabels('nonprofit'),
    dashboardCopy: {
      healthSummaryTitle: 'Community Impact Summary',
      healthSummaryLines: [
        'Resident outcome indicators are meeting nonprofit program targets.',
        'Affordability and participation metrics remain stable.',
        'No unresolved commitment issues are currently flagged.'
      ]
    },
    terminology: {
      program: 'community services program',
      tenants: 'residents served',
      compliance: 'program commitments',
      portfolio: 'program portfolio'
    }
  },
  other: {
    primaryMetrics: [
      'communityImpact',
      'housingOutcomes',
      'programPerformance',
      'publicReporting'
    ],
    defaultPage: COMMUNITY_GLOBAL_SIDEBAR_LABELS.overview,
    pageTitle: COMMUNITY_GLOBAL_SIDEBAR_LABELS.overview,
    portfolioLabel: COMMUNITY_PORTFOLIO_LABEL,
    toolbarLabels: COMMUNITY_TOOLBAR_LABELS,
    sidebarLabels: buildCommunitySidebarLabels('other'),
    dashboardCopy: {
      healthSummaryTitle: 'Community Impact Summary',
      healthSummaryLines: [
        'Community impact and housing outcome indicators remain stable.',
        'Program performance is within approved reporting thresholds.',
        'Public reporting commitments are on schedule.'
      ]
    },
    terminology: {
      program: 'community program',
      tenants: 'participants',
      compliance: 'commitments',
      portfolio: 'program portfolio'
    }
  }
}

export const DEFAULT_COMMUNITY_DASHBOARD_CONFIG_KEY: CommunityDashboardConfigKey =
  'municipality'
