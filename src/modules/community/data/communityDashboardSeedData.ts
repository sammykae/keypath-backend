import type { CommunityDashboardConfigKey } from '../constants/communityDashboardConfig'
import type { CommunityDashboardPageContent } from './communityDashboardPageSeed'
import { communityDashboardPageContent } from './communityDashboardPageSeed'
import { COMMUNITY_PROGRAM_SEED } from './communityDashboardProgramSeed'

const APPNAME = 'KeyPath'

export type SparklinePoint = { x: number; y: number }

export type CommunityOverviewHealthStatus = {
  program: string
  portfolio: string
  compliance: string
}

export type HousingProjectRow = {
  name: string
  location: string
  developer: string
  type: string
  units: string
  status: string
  schedule: string
  complete: string
}

export type HousingProjectDetail = {
  name: string
  location: string
  developer: string
  projectType: string
  status: string
}

export type HousingProjectBudget = {
  budgetedTotal: string
  spentToDate: string
  variance: string
}

export type HousingProjectRiskFlag = {
  label: string
  detail: string
  severity: 'high' | 'low'
}

export type FiscalActivityBar = {
  value: string
  widthPercent: number
  color?: string
}

export type FiscalImpactEstimates = {
  programActivityValue: string
  portfolioImpactValue: string
  publicBenefitYtd: string
}

export type LocalSpendBreakdown = {
  localPercent: number
  nonLocalPercent: number
}

export type TenantParticipationGrowthPoint = {
  year: number
  tenants: number
  percentage: number
  benchmark: number
}

export type TenantEconomicValuePoint = {
  year: number
  value: number
  color: string
}

export type TenantParticipationCohort = {
  name: string
  year: number
  accum: string
  retention: string
}

export type TenantParticipationEconomicMetrics = {
  aggregateParticipationYoy: string
  averageAccumulationRange: string
}

export type CommunityAuditTrailEvent = {
  id: string
  timestamp: string
  actor: string
  action: string
  detail: string
}

export type CommunityStakeholderMessage = {
  id: string
  from: string
  subject: string
  preview: string
  sentAt: string
  unread: boolean
}

export type CommunityDashboardSeedSlice = {
  pageContent: CommunityDashboardPageContent
  programs: (typeof COMMUNITY_PROGRAM_SEED)[CommunityDashboardConfigKey]
  overview: {
    sparklineData: SparklinePoint[]
    healthStatuses: CommunityOverviewHealthStatus
  }
  housingProjects: {
    projects: HousingProjectRow[]
    featuredProject: HousingProjectDetail
    budget: HousingProjectBudget
    riskFlags: HousingProjectRiskFlag[]
  }
  fiscalImpact: {
    activityBars: FiscalActivityBar[]
    estimates: FiscalImpactEstimates
  }
  economicImpact: {
    localSpendBreakdown: LocalSpendBreakdown
  }
  tenantParticipation: {
    growthData: TenantParticipationGrowthPoint[]
    economicValueData: TenantEconomicValuePoint[]
    cohorts: TenantParticipationCohort[]
    economicMetrics: TenantParticipationEconomicMetrics
  }
  messages: CommunityStakeholderMessage[]
  auditTrail: CommunityAuditTrailEvent[]
}

const SHARED_METRICS = {
  overview: {
    sparklineData: [
      { x: 1, y: 5 },
      { x: 2, y: 8 },
      { x: 3, y: 7 },
      { x: 4, y: 11 },
      { x: 5, y: 9 },
      { x: 6, y: 13 },
      { x: 7, y: 10 },
      { x: 8, y: 12 }
    ],
    healthStatuses: {
      program: 'Stable',
      portfolio: 'Within Range',
      compliance: 'Green'
    }
  },
  housingProjects: {
    projects: [
      {
        name: 'Willow Heights',
        location: 'Austin, TX',
        developer: 'GreenStone Dev Co',
        type: 'Workforce Housing',
        units: '220 / 210',
        status: 'Leasing',
        schedule: 'At Risk',
        complete: '88%'
      },
      {
        name: 'Harbor Point',
        location: 'Oakland, CA',
        developer: 'Bayline Group',
        type: 'Mixed-Use',
        units: '180 / 180',
        status: 'Stabilized',
        schedule: 'On Schedule',
        complete: '100%'
      },
      {
        name: 'Riverbend Flats',
        location: 'Columbus, OH',
        developer: 'NorthRow',
        type: 'BTR',
        units: '140 / 120',
        status: 'Construction',
        schedule: 'Delayed',
        complete: '100%'
      },
      {
        name: 'Maple Crossing',
        location: 'Denver, CO',
        developer: 'MileHigh Living',
        type: 'SFR',
        units: '95 / 90',
        status: 'Leasing',
        schedule: 'On Schedule',
        complete: '100%'
      }
    ],
    featuredProject: {
      name: 'Willow Heights',
      location: 'Austin, Texas',
      developer: 'GreenStone Development Co.',
      projectType: 'Workforce Housing',
      status: 'Leasing'
    },
    budget: {
      budgetedTotal: '$48,000,000',
      spentToDate: '$44,900,000',
      variance: '+3.1%'
    },
    riskFlags: [
      { label: 'Construction Delay', detail: 'Material shortages', severity: 'high' as const },
      { label: 'Financing', detail: 'No issues detected', severity: 'low' as const },
      { label: 'Permitting', detail: 'Approved', severity: 'low' as const }
    ]
  },
  fiscalImpact: {
    activityBars: [
      { value: '$145M', widthPercent: 80, color: '#34d399' },
      { value: '$62M', widthPercent: 65, color: '#93c5fd' },
      { value: '$18M', widthPercent: 50, color: '#cbd5e1' }
    ],
    estimates: {
      programActivityValue: '$225M',
      portfolioImpactValue: '$225M',
      publicBenefitYtd: '$13.1M'
    }
  },
  economicImpact: {
    localSpendBreakdown: {
      localPercent: 61.7,
      nonLocalPercent: 38
    }
  },
  tenantParticipation: {
    growthData: [
      { year: 2021, tenants: 420, percentage: 22, benchmark: 35 },
      { year: 2022, tenants: 860, percentage: 42, benchmark: 22 },
      { year: 2023, tenants: 2050, percentage: 68, benchmark: 50 },
      { year: 2024, tenants: 2450, percentage: 88, benchmark: 55 }
    ],
    economicValueData: [
      { year: 2024, value: 22.4, color: '#10B981' },
      { year: 2023, value: 14.6, color: '#818CF8' },
      { year: 2022, value: 7.8, color: '#94A3B8' },
      { year: 2021, value: 3.8, color: '#CBD5E1' },
      { year: 2020, value: 1.4, color: '#FEE2E2' }
    ],
    cohorts: [
      { name: 'Cohort A', year: 2021, accum: '$3,400', retention: '82%' },
      { name: 'Cohort B', year: 2022, accum: '$4,100', retention: '86%' },
      { name: 'Cohort C', year: 2023, accum: '$4,900', retention: '89%' }
    ],
    economicMetrics: {
      aggregateParticipationYoy: '$3.84M (+21%)',
      averageAccumulationRange: '$2,400 – $7,800 (aggregate ranges only)'
    }
  },
  messages: [
    {
      id: 'msg-1',
      from: `${APPNAME} Program Team`,
      subject: 'Q1 reporting reminder',
      preview: 'Quarterly impact summaries are due by March 15.',
      sentAt: '2025-03-01T10:00:00Z',
      unread: true
    },
    {
      id: 'msg-2',
      from: 'GreenStone Development Co.',
      subject: 'Willow Heights leasing update',
      preview: 'Leasing velocity remains on track for the current quarter.',
      sentAt: '2025-02-28T14:30:00Z',
      unread: false
    }
  ],
  auditTrail: [
    {
      id: 'audit-1',
      timestamp: '2025-03-02T09:15:00Z',
      actor: 'Program Administrator',
      action: 'Dashboard report exported',
      detail: 'Community Impact Overview (PDF)'
    },
    {
      id: 'audit-2',
      timestamp: '2025-02-27T16:40:00Z',
      actor: 'Commitments Reviewer',
      action: 'Commitment status updated',
      detail: 'Local Vendor Spend marked On Track'
    }
  ]
}

function buildSeedSlice(
  configKey: CommunityDashboardConfigKey
): CommunityDashboardSeedSlice {
  return {
    pageContent: communityDashboardPageContent[configKey],
    programs: COMMUNITY_PROGRAM_SEED[configKey],
    ...SHARED_METRICS
  }
}

export const COMMUNITY_DASHBOARD_SEED_DATA: Record<
  CommunityDashboardConfigKey,
  CommunityDashboardSeedSlice
> = {
  municipality: buildSeedSlice('municipality'),
  housingAuthority: buildSeedSlice('housingAuthority'),
  landAuthority: buildSeedSlice('landAuthority'),
  university: buildSeedSlice('university'),
  faithBased: buildSeedSlice('faithBased'),
  nonprofit: buildSeedSlice('nonprofit'),
  other: buildSeedSlice('other')
}

export function getCommunityDashboardSeed(
  configKey: CommunityDashboardConfigKey
): CommunityDashboardSeedSlice {
  return COMMUNITY_DASHBOARD_SEED_DATA[configKey]
}

export function getCommunityPageContent(
  configKey: CommunityDashboardConfigKey
): CommunityDashboardPageContent {
  return getCommunityDashboardSeed(configKey).pageContent
}
