import type { CommunityDashboardConfigKey } from './communityDashboardConfig'

export const COMMUNITY_GLOBAL_SIDEBAR_LABELS = {
  overview: 'Community Impact Overview',
  projects: 'Housing Projects & Development',
  economicImpact: 'Local Economic & Workforce Impact',
  tenantParticipation: 'Tenant Equity & Rewards Participation',
  compliance: 'Commitments & Compliance',
  reports: 'Reports',
  messages: 'Stakeholder Messages & Audit Trail'
} as const

export const COMMUNITY_PORTFOLIO_LABEL = 'Community Programs'

export const COMMUNITY_TOOLBAR_LABELS = {
  exportReport: 'Export Dashboard Report',
  aiInsights: 'KeyPath AI Insights'
} as const

export const COMMUNITY_EXPORT_DIALOG_COPY = {
  title: 'Export Dashboard Report',
  description:
    'Get a polished community impact report with program metrics, economic and workforce outcomes, and stakeholder-ready visuals—ready to download or share.'
} as const

export const COMMUNITY_FISCAL_IMPACT_TITLES: Record<
  CommunityDashboardConfigKey,
  string
> = {
  municipality: 'Public Revenue & Tax Base Impact',
  housingAuthority: 'Housing Stability & Public Benefit',
  landAuthority: 'Land Value & Public Benefit',
  university: 'Campus Housing & Community Impact',
  faithBased: 'Mission & Community Impact',
  nonprofit: 'Resident Outcomes & Community Impact',
  other: 'Community Impact & Public Benefit'
}

export function buildCommunitySidebarLabels(configKey: CommunityDashboardConfigKey) {
  return {
    ...COMMUNITY_GLOBAL_SIDEBAR_LABELS,
    fiscalImpact: COMMUNITY_FISCAL_IMPACT_TITLES[configKey]
  }
}
