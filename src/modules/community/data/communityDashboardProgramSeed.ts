import type {
  CommunityDashboardConfigKey,
  CommunityDashboardKpiCard,
  CommunityDashboardReportItem
} from '../constants/communityDashboardConfig'

export type CommunityProgramSeed = {
  kpiCards: CommunityDashboardKpiCard[]
  reportItems: CommunityDashboardReportItem[]
  briefGenerator?: {
    title: string
    description: string
  }
}

export const COMMUNITY_PROGRAM_SEED: Record<
  CommunityDashboardConfigKey,
  CommunityProgramSeed
> = {
  municipality: {
    kpiCards: [
      {
        key: 'taxBaseUplift',
        title: 'Tax Base Uplift',
        value: '+4.2%',
        subtitle: 'Year-over-year assessed value growth from program areas'
      },
      {
        key: 'jobsCreated',
        title: 'Jobs Created',
        value: '1,240',
        subtitle: 'Local jobs supported through active developments'
      },
      {
        key: 'localSpend',
        title: 'Local Spend',
        value: '$18.6M',
        subtitle: 'Vendor and contractor spend retained in the region'
      },
      {
        key: 'complianceStatus',
        title: 'Commitments Status',
        value: 'On Track',
        subtitle: 'No critical commitment issues detected'
      }
    ],
    reportItems: [
      {
        title: 'City Council Brief',
        description: 'Executive summary for council meetings and public hearings'
      },
      {
        title: 'Public Revenue & Tax Base Impact Report',
        description: 'Tax base, revenue, and budget impact analysis'
      },
      {
        title: 'Local Vendor Spend Report',
        description: 'Regional vendor participation and spend retention'
      }
    ],
    briefGenerator: {
      title: 'Generate City Council Brief',
      description:
        'Creates a presentation-ready summary for council meetings and public hearings.'
    }
  },
  housingAuthority: {
    kpiCards: [
      {
        key: 'affordableUnits',
        title: 'Affordable Units',
        value: '1,180',
        subtitle: 'Income-restricted units under active oversight'
      },
      {
        key: 'tenantParticipation',
        title: 'Tenant Equity & Rewards Participation',
        value: '62%',
        subtitle: '732 residents enrolled in equity and rewards programs'
      },
      {
        key: 'housingStability',
        title: 'Housing Stability',
        value: '91%',
        subtitle: '12-month resident retention across monitored developments'
      },
      {
        key: 'occupancy',
        title: 'Occupancy',
        value: '88.6%',
        subtitle: 'Average occupancy across affordable developments'
      }
    ],
    reportItems: [
      {
        title: 'Housing Stability Report',
        description: 'Retention, turnover, and stability metrics for residents'
      },
      {
        title: 'Tenant Equity & Rewards Participation Summary',
        description: 'Aggregate equity and rewards program enrollment and outcomes'
      },
      {
        title: 'Affordability Report',
        description: 'Rent burden, AMI compliance, and affordability trends'
      }
    ]
  },
  landAuthority: {
    kpiCards: [
      {
        key: 'landProjects',
        title: 'Land Projects',
        value: '12',
        subtitle: 'Active disposition and redevelopment projects'
      },
      {
        key: 'unitsDelivered',
        title: 'Units Delivered',
        value: '1,180 / 1,250',
        subtitle: '94% of planned units delivered on program land'
      },
      {
        key: 'developerCompliance',
        title: 'Developer Commitments Status',
        value: 'On Track',
        subtitle: 'No critical developer commitment breaches flagged'
      },
      {
        key: 'publicLandValue',
        title: 'Public Land Value',
        value: '$42.8M',
        subtitle: 'Assessed public benefit value across active projects'
      }
    ],
    reportItems: [
      {
        title: 'Land Disposition Report',
        description: 'Status of land transfers and redevelopment milestones'
      },
      {
        title: 'Developer Commitment Report',
        description: 'Affordability, hiring, and community benefit commitments'
      },
      {
        title: 'Public Benefit Report',
        description: 'Community benefit and public land value outcomes'
      }
    ]
  },
  university: {
    kpiCards: [
      {
        key: 'studentHousingUnits',
        title: 'Student Housing Units',
        value: '640',
        subtitle: 'Units serving enrolled students in program developments'
      },
      {
        key: 'workforceHousingUnits',
        title: 'Workforce Housing Units',
        value: '285',
        subtitle: 'Units reserved for campus and community workforce'
      },
      {
        key: 'occupancy',
        title: 'Occupancy',
        value: '92.4%',
        subtitle: 'Average occupancy across campus housing projects'
      },
      {
        key: 'projectStatus',
        title: 'Project Status',
        value: 'On Track',
        subtitle: 'All active campus projects within milestone targets'
      }
    ],
    reportItems: [
      {
        title: 'Campus Housing Impact Report',
        description: 'Student housing outcomes and campus partnership metrics'
      },
      {
        title: 'Workforce Housing Report',
        description: 'Workforce unit delivery, occupancy, and affordability'
      }
    ]
  },
  faithBased: {
    kpiCards: [
      {
        key: 'communityBenefit',
        title: 'Community Benefit',
        value: 'High',
        subtitle: 'Aggregate community benefit across ministry housing projects'
      },
      {
        key: 'housingUnitsCreated',
        title: 'Housing Units Created',
        value: '186',
        subtitle: 'Units delivered through faith-based housing partnerships'
      },
      {
        key: 'tenantStability',
        title: 'Resident Stability',
        value: '89%',
        subtitle: '12-month stability across ministry-supported housing'
      },
      {
        key: 'missionImpact',
        title: 'Mission Impact',
        value: 'On Track',
        subtitle: 'Mission-aligned outcomes meeting program goals'
      }
    ],
    reportItems: [
      {
        title: 'Mission Impact Report',
        description: 'Mission-aligned housing and community benefit outcomes'
      },
      {
        title: 'Housing Ministry Report',
        description: 'Unit delivery, resident stability, and stewardship metrics'
      }
    ]
  },
  nonprofit: {
    kpiCards: [
      {
        key: 'residentOutcomes',
        title: 'Resident Outcomes',
        value: 'Strong',
        subtitle: 'Outcome indicators across served resident populations'
      },
      {
        key: 'affordability',
        title: 'Affordability',
        value: '87%',
        subtitle: 'Residents within target affordability thresholds'
      },
      {
        key: 'tenantStability',
        title: 'Resident Stability',
        value: '90%',
        subtitle: '12-month retention across nonprofit housing programs'
      },
      {
        key: 'programParticipation',
        title: 'Tenant Equity & Rewards Participation',
        value: '58%',
        subtitle: 'Residents actively enrolled in equity and rewards programs'
      }
    ],
    reportItems: [
      {
        title: 'Resident Impact Report',
        description: 'Resident outcomes, stability, and service participation'
      },
      {
        title: 'Community Services Report',
        description: 'Community services delivery and program performance'
      }
    ]
  },
  other: {
    kpiCards: [
      {
        key: 'communityImpact',
        title: 'Community Impact',
        value: 'Positive',
        subtitle: 'Aggregate community impact across monitored programs'
      },
      {
        key: 'housingOutcomes',
        title: 'Housing Outcomes',
        value: '1,046',
        subtitle: 'Households served across active housing programs'
      },
      {
        key: 'programPerformance',
        title: 'Program Performance',
        value: 'On Track',
        subtitle: 'Performance metrics within approved targets'
      },
      {
        key: 'publicReporting',
        title: 'Public Reporting',
        value: 'Current',
        subtitle: 'All required public reports submitted on schedule'
      }
    ],
    reportItems: [
      {
        title: 'Public Brief',
        description: 'Public-facing summary of program performance and outcomes'
      },
      {
        title: 'Community Impact Report',
        description: 'Community impact, housing outcomes, and accountability metrics'
      }
    ]
  }
}
