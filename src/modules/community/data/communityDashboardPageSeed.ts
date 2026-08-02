import type {
  CommunityDashboardConfigKey,
  CommunityDashboardKpiCard
} from '../constants/communityDashboardConfig'

export type CommunityDashboardMetricRow = {
  label: string
  value: string
}

export type CommunityCompliancePledgeRow = {
  type: string
  promised: string
  achieved: string
  status: string
  target: string
}

export type CommunityDashboardPageContent = {
  fiscalImpact: {
    kpiCards: CommunityDashboardKpiCard[]
    economicActivityTitle: string
    publicBenefitTitle: string
    bottomMetrics: CommunityDashboardMetricRow[]
  }
  economicImpact: {
    spendOverviewTitle: string
    spendMetrics: CommunityDashboardMetricRow[]
    vendorBreakdownTitle: string
    vendorMetrics: CommunityDashboardMetricRow[]
    localSpendTitle: string
    jobsTitle: string
    jobMetrics: CommunityDashboardMetricRow[]
  }
  compliance: {
    pledgeTableTitle: string
    overviewTitle: string
    pledgeRows: CommunityCompliancePledgeRow[]
    overviewItems: CommunityDashboardMetricRow[]
  }
  projects: {
    tableTitle: string
    budgetSnapshotTitle: string
    budgetNote: string
    riskFlagsTitle: string
  }
  tenantParticipation: {
    topKpis: CommunityDashboardMetricRow[]
    growthChartTitle: string
    aggregateValueTitle: string
    cohortTableTitle: string
    outcomesTitle: string
    outcomesCopy: string
    participationSectionTitle: string
    participationMetrics: CommunityDashboardMetricRow[]
    economicValueTitle: string
    retentionTitle: string
    retentionMetrics: CommunityDashboardMetricRow[]
  }
  getHelpDescription: string
}

const municipalityPages: CommunityDashboardPageContent = {
  fiscalImpact: {
    kpiCards: [
      {
        key: 'baselineAssessed',
        title: 'Baseline Assessed Value',
        value: '$312,000,000',
        subtitle: 'Pre-development assessed value'
      },
      {
        key: 'currentAssessed',
        title: 'Current Estimated Assessed Value',
        value: '$418,500,000',
        subtitle: 'Post-development estimated value'
      },
      {
        key: 'taxBaseUplift',
        title: 'Net Tax Base Uplift',
        value: '+$106,500,000',
        subtitle: 'Estimated increase in taxable property value'
      },
      {
        key: 'annualTaxImpact',
        title: 'Annual Property Tax Impact (Est.)',
        value: '$2.34M / year',
        subtitle: 'Based on current municipal millage'
      }
    ],
    economicActivityTitle: 'Economic Activity Generated (Est.)',
    publicBenefitTitle: 'Total Public Benefit Summary',
    bottomMetrics: [
      { label: 'Total Jobs Supported (Est.)', value: '1,480 jobs' },
      { label: 'Total Wage Base Generated', value: '$68.4M' },
      { label: 'Estimated Payroll Tax Contribution', value: '$4.7M' }
    ]
  },
  economicImpact: {
    spendOverviewTitle: 'Spend Overview',
    spendMetrics: [
      { label: 'Total Project Spend:', value: '$48.0M' },
      { label: 'Local Spend (City):', value: '$29.6M (61.7%)' },
      { label: 'State Spend:', value: '$11.2M (23.3%)' },
      { label: 'Outside Region:', value: '$7.2M (15%)' }
    ],
    vendorBreakdownTitle: 'Vendor Category Breakdown',
    vendorMetrics: [
      { label: 'Construction Services:', value: '$31.4M' },
      { label: 'Maintenance & Operations:', value: '$8.6M' },
      { label: 'Professional Services:', value: '$5.1M' },
      { label: 'Other Services:', value: '$2.9M' }
    ],
    localSpendTitle: 'Local vs Non-Local Spend',
    jobsTitle: 'Jobs And Workforce Metrics',
    jobMetrics: [
      { label: 'Construction Jobs Created:', value: '146 (estimated)' },
      { label: 'Ongoing Property Jobs:', value: '18' },
      { label: 'Local Hires:', value: '64%' },
      { label: 'MWBE Participation:', value: '28%' }
    ]
  },
  compliance: {
    pledgeTableTitle: 'Commitments Tracking',
    overviewTitle: 'Commitments Overview',
    pledgeRows: [
      {
        type: 'Affordable Units',
        promised: '180',
        achieved: '172',
        status: 'At Risk',
        target: 'At Risk'
      },
      {
        type: 'Local Vendor Spend',
        promised: '60%',
        achieved: '61.7%',
        status: 'On Track',
        target: 'Exceeded target'
      },
      {
        type: 'Tenant Equity & Rewards Participation',
        promised: '60%',
        achieved: '62%',
        status: 'On Track',
        target: 'Above target'
      },
      {
        type: 'Community Programs',
        promised: '3 programs',
        achieved: '2 completed',
        status: 'On Track',
        target: 'Above target'
      }
    ],
    overviewItems: [
      { label: 'Zoning Compliance:', value: 'Compliant' },
      { label: 'Housing Covenants:', value: 'Active' },
      { label: 'Reporting Status:', value: 'Up to Date' },
      { label: 'Next Audit:', value: 'March 2025' }
    ]
  },
  projects: {
    tableTitle: 'Projects Table',
    budgetSnapshotTitle: 'Budget Snapshot',
    budgetNote:
      'Budget details are summarized for municipal oversight and do not include private financing terms.',
    riskFlagsTitle: 'Risk Flags'
  },
  tenantParticipation: {
    topKpis: [
      { label: 'Average Accumulation (Per Tenant, Range)', value: '$6,200 – $14,800' },
      { label: 'Median Participation Duration', value: '3.2 years' },
      { label: 'YoY Growth Rate', value: '+34%' }
    ],
    growthChartTitle: 'Tenant Equity & Rewards Participation Growth Over Time',
    aggregateValueTitle: 'Aggregate Tenant Equity & Rewards Value',
    cohortTableTitle: 'Project-Level View (Aggregated)',
    outcomesTitle: 'Long-Term Economic Participation Outcomes',
    outcomesCopy:
      'Tenant equity and rewards participation through TEPA demonstrates consistent year-over-year economic value growth and higher retention compared to non-participating households.',
    participationSectionTitle: 'Tenant Equity & Rewards Participation',
    participationMetrics: [
      { label: 'Eligible Tenants:', value: '1,180' },
      { label: 'Opted Into TEPA:', value: '732 (62%)' },
      { label: 'Program Enrollment Growth:', value: '+14%' },
      { label: 'Active Participants:', value: '689' }
    ],
    economicValueTitle: 'Economic Participation Value',
    retentionTitle: 'Retention Comparison',
    retentionMetrics: [
      { label: 'TEPA Participants — Average Stay:', value: '28.4 months' },
      { label: 'Non-Participants — Average Stay:', value: '19.6 months' }
    ]
  },
  getHelpDescription:
    'Support resources and contact options for municipal program oversight. For urgent issues, contact your KeyPath program administrator.'
}

const housingAuthorityPages: CommunityDashboardPageContent = {
  fiscalImpact: {
    kpiCards: [
      {
        key: 'subsidyExposure',
        title: 'Operating Subsidy Exposure',
        value: '$8.2M',
        subtitle: 'Annual subsidy required across affordable portfolio'
      },
      {
        key: 'affordabilityGap',
        title: 'Affordability Gap Closed',
        value: '74%',
        subtitle: 'Share of AMI gap covered by program subsidies'
      },
      {
        key: 'rentRevenue',
        title: 'Rent Revenue (Subsidized)',
        value: '$24.6M',
        subtitle: 'Collected resident payments across portfolio'
      },
      {
        key: 'occupancy',
        title: 'Program Occupancy',
        value: '88.6%',
        subtitle: 'Average occupancy across affordable developments'
      }
    ],
    economicActivityTitle: 'Housing Program Fiscal Activity (Est.)',
    publicBenefitTitle: 'Housing Outcomes Fiscal Summary',
    bottomMetrics: [
      { label: 'Residents Housed (Est.)', value: '1,046 households' },
      { label: 'Subsidy Per Unit (Avg.)', value: '$6,950' },
      { label: 'Operating Reserve Status', value: 'Stable' }
    ]
  },
  economicImpact: {
    spendOverviewTitle: 'Resident Economic Impact Overview',
    spendMetrics: [
      { label: 'Total Program Spend:', value: '$48.0M' },
      { label: 'Local Resident Spend:', value: '$29.6M (61.7%)' },
      { label: 'Regional Vendor Spend:', value: '$11.2M (23.3%)' },
      { label: 'Outside Region:', value: '$7.2M (15%)' }
    ],
    vendorBreakdownTitle: 'Housing Services Breakdown',
    vendorMetrics: [
      { label: 'Construction & Rehab:', value: '$31.4M' },
      { label: 'Property Operations:', value: '$8.6M' },
      { label: 'Resident Services:', value: '$5.1M' },
      { label: 'Other Services:', value: '$2.9M' }
    ],
    localSpendTitle: 'Local vs Regional Spend',
    jobsTitle: 'Workforce & Resident Employment',
    jobMetrics: [
      { label: 'Construction Jobs Supported:', value: '146 (estimated)' },
      { label: 'Ongoing Property Jobs:', value: '18' },
      { label: 'Resident Employment Programs:', value: '64%' },
      { label: 'MWBE Participation:', value: '28%' }
    ]
  },
  compliance: {
    pledgeTableTitle: 'Housing Commitments Tracking',
    overviewTitle: 'Housing Commitments Overview',
    pledgeRows: [
      {
        type: 'Affordable Units',
        promised: '180',
        achieved: '172',
        status: 'At Risk',
        target: 'At Risk'
      },
      {
        type: 'AMI Compliance',
        promised: '100%',
        achieved: '98%',
        status: 'On Track',
        target: 'Within tolerance'
      },
      {
        type: 'Tenant Equity & Rewards Participation',
        promised: '60%',
        achieved: '62%',
        status: 'On Track',
        target: 'Above target'
      },
      {
        type: 'Inspection Readiness',
        promised: '4 audits',
        achieved: '3 completed',
        status: 'On Track',
        target: 'On schedule'
      }
    ],
    overviewItems: [
      { label: 'HUD / Regulatory Compliance:', value: 'Compliant' },
      { label: 'Affordability Covenants:', value: 'Active' },
      { label: 'Reporting Status:', value: 'Up to Date' },
      { label: 'Next Inspection:', value: 'March 2025' }
    ]
  },
  projects: {
    tableTitle: 'Affordable Developments Table',
    budgetSnapshotTitle: 'Development Budget Snapshot',
    budgetNote:
      'Budget details are summarized for housing authority oversight and do not include private financing terms.',
    riskFlagsTitle: 'Development Risk Flags'
  },
  tenantParticipation: {
    topKpis: [
      { label: 'Average Resident Benefit (Range)', value: '$6,200 – $14,800' },
      { label: 'Median Program Duration', value: '3.2 years' },
      { label: 'YoY Participation Growth', value: '+34%' }
    ],
    growthChartTitle: 'Tenant Equity & Rewards Participation Growth Over Time',
    aggregateValueTitle: 'Aggregate Tenant Equity & Rewards Value',
    cohortTableTitle: 'Property-Level View (Aggregated)',
    outcomesTitle: 'Long-Term Housing Stability Outcomes',
    outcomesCopy:
      'Resident participation programs demonstrate year-over-year stability gains and stronger retention across affordable housing developments.',
    participationSectionTitle: 'Tenant Equity & Rewards Participation',
    participationMetrics: [
      { label: 'Eligible Residents:', value: '1,180' },
      { label: 'Enrolled in Programs:', value: '732 (62%)' },
      { label: 'Program Growth (12 mo):', value: '+14%' },
      { label: 'Active Participants:', value: '689' }
    ],
    economicValueTitle: 'Resident Economic Value',
    retentionTitle: 'Housing Stability Comparison',
    retentionMetrics: [
      { label: 'Program Participants — Avg. Stay:', value: '28.4 months' },
      { label: 'Non-Participants — Avg. Stay:', value: '19.6 months' }
    ]
  },
  getHelpDescription:
    'Support resources for housing authority program staff. For urgent issues, contact your KeyPath program administrator.'
}

const landAuthorityPages: CommunityDashboardPageContent = {
  fiscalImpact: {
    kpiCards: [
      {
        key: 'publicLandValue',
        title: 'Public Land Value',
        value: '$42.8M',
        subtitle: 'Assessed public benefit value across active sites'
      },
      {
        key: 'dispositionProceeds',
        title: 'Disposition Proceeds',
        value: '$18.4M',
        subtitle: 'Revenue from completed land dispositions'
      },
      {
        key: 'developerCompliance',
        title: 'Developer Compliance',
        value: 'On Track',
        subtitle: 'Commitments met across monitored developments'
      },
      {
        key: 'unitsDelivered',
        title: 'Units Delivered',
        value: '1,180 / 1,250',
        subtitle: '94% of planned units on program land'
      }
    ],
    economicActivityTitle: 'Land Program Economic Activity (Est.)',
    publicBenefitTitle: 'Public Benefit Fiscal Summary',
    bottomMetrics: [
      { label: 'Active Land Projects', value: '12' },
      { label: 'Community Benefit Value', value: '$31.2M' },
      { label: 'Developer Penalties Outstanding', value: 'None' }
    ]
  },
  economicImpact: {
    spendOverviewTitle: 'Land Development Spend Overview',
    spendMetrics: [
      { label: 'Total Development Spend:', value: '$48.0M' },
      { label: 'Regional Spend:', value: '$29.6M (61.7%)' },
      { label: 'State Spend:', value: '$11.2M (23.3%)' },
      { label: 'Outside Region:', value: '$7.2M (15%)' }
    ],
    vendorBreakdownTitle: 'Developer & Contractor Breakdown',
    vendorMetrics: [
      { label: 'Site Preparation:', value: '$31.4M' },
      { label: 'Infrastructure:', value: '$8.6M' },
      { label: 'Professional Services:', value: '$5.1M' },
      { label: 'Other Services:', value: '$2.9M' }
    ],
    localSpendTitle: 'Regional vs Non-Regional Spend',
    jobsTitle: 'Jobs Supported by Land Projects',
    jobMetrics: [
      { label: 'Construction Jobs Created:', value: '146 (estimated)' },
      { label: 'Ongoing Operations Jobs:', value: '18' },
      { label: 'Local Hires:', value: '64%' },
      { label: 'MWBE Participation:', value: '28%' }
    ]
  },
  compliance: {
    pledgeTableTitle: 'Developer Commitment Tracking',
    overviewTitle: 'Land Program Commitments Overview',
    pledgeRows: [
      {
        type: 'Affordable Units on Land',
        promised: '180',
        achieved: '172',
        status: 'At Risk',
        target: 'At Risk'
      },
      {
        type: 'Public Benefit Commitments',
        promised: '100%',
        achieved: '96%',
        status: 'On Track',
        target: 'Within tolerance'
      },
      {
        type: 'Disposition Milestones',
        promised: '8 sites',
        achieved: '7 complete',
        status: 'On Track',
        target: 'On schedule'
      },
      {
        type: 'Environmental Review',
        promised: '4 reviews',
        achieved: '4 approved',
        status: 'On Track',
        target: 'Complete'
      }
    ],
    overviewItems: [
      { label: 'Land Use Compliance:', value: 'Compliant' },
      { label: 'Developer Agreements:', value: 'Active' },
      { label: 'Reporting Status:', value: 'Up to Date' },
      { label: 'Next Review:', value: 'March 2025' }
    ]
  },
  projects: {
    tableTitle: 'Land Projects Table',
    budgetSnapshotTitle: 'Disposition Budget Snapshot',
    budgetNote:
      'Budget details are summarized for land authority oversight and do not include private financing terms.',
    riskFlagsTitle: 'Land Project Risk Flags'
  },
  tenantParticipation: {
    topKpis: [
      { label: 'Community Beneficiaries Served', value: '1,046' },
      { label: 'Avg. Program Engagement Duration', value: '3.2 years' },
      { label: 'YoY Community Benefit Growth', value: '+34%' }
    ],
    growthChartTitle: 'Community Benefit Growth Over Time',
    aggregateValueTitle: 'Aggregate Community Benefit Value',
    cohortTableTitle: 'Site-Level View (Aggregated)',
    outcomesTitle: 'Long-Term Public Benefit Outcomes',
    outcomesCopy:
      'Land disposition programs are delivering planned community benefit and housing outcomes across monitored developments.',
    participationSectionTitle: 'Tenant Equity & Rewards Participation',
    participationMetrics: [
      { label: 'Eligible Households:', value: '1,180' },
      { label: 'Participating Households:', value: '732 (62%)' },
      { label: 'Engagement Growth (12 mo):', value: '+14%' },
      { label: 'Active Participants:', value: '689' }
    ],
    economicValueTitle: 'Community Benefit Value',
    retentionTitle: 'Household Stability Comparison',
    retentionMetrics: [
      { label: 'Program Participants — Avg. Stay:', value: '28.4 months' },
      { label: 'Non-Participants — Avg. Stay:', value: '19.6 months' }
    ]
  },
  getHelpDescription:
    'Support resources for land authority program staff. For urgent issues, contact your KeyPath program administrator.'
}

const universityPages: CommunityDashboardPageContent = {
  fiscalImpact: {
    kpiCards: [
      {
        key: 'studentHousingUnits',
        title: 'Student Housing Units',
        value: '640',
        subtitle: 'Units serving enrolled students'
      },
      {
        key: 'workforceHousingUnits',
        title: 'Workforce Housing Units',
        value: '285',
        subtitle: 'Units reserved for campus workforce'
      },
      {
        key: 'occupancy',
        title: 'Campus Housing Occupancy',
        value: '92.4%',
        subtitle: 'Average occupancy across campus projects'
      },
      {
        key: 'projectStatus',
        title: 'Project Status',
        value: 'On Track',
        subtitle: 'All active projects within milestone targets'
      }
    ],
    economicActivityTitle: 'Campus Housing Fiscal Activity (Est.)',
    publicBenefitTitle: 'Institutional Housing Fiscal Summary',
    bottomMetrics: [
      { label: 'Students Housed', value: '640' },
      { label: 'Workforce Residents Housed', value: '285' },
      { label: 'Program Reserve Status', value: 'Stable' }
    ]
  },
  economicImpact: {
    spendOverviewTitle: 'Campus Program Spend Overview',
    spendMetrics: [
      { label: 'Total Campus Spend:', value: '$48.0M' },
      { label: 'Local Spend:', value: '$29.6M (61.7%)' },
      { label: 'Regional Spend:', value: '$11.2M (23.3%)' },
      { label: 'Outside Region:', value: '$7.2M (15%)' }
    ],
    vendorBreakdownTitle: 'Campus Vendor Breakdown',
    vendorMetrics: [
      { label: 'Construction & Renovation:', value: '$31.4M' },
      { label: 'Campus Operations:', value: '$8.6M' },
      { label: 'Student Services:', value: '$5.1M' },
      { label: 'Other Services:', value: '$2.9M' }
    ],
    localSpendTitle: 'Local vs Regional Spend',
    jobsTitle: 'Campus Workforce Metrics',
    jobMetrics: [
      { label: 'Construction Jobs Created:', value: '146 (estimated)' },
      { label: 'Ongoing Campus Jobs:', value: '18' },
      { label: 'Student Employment Programs:', value: '64%' },
      { label: 'Diverse Vendor Participation:', value: '28%' }
    ]
  },
  compliance: {
    pledgeTableTitle: 'Institutional Commitment Tracking',
    overviewTitle: 'Institutional Commitments Overview',
    pledgeRows: [
      {
        type: 'Student Housing Units',
        promised: '650',
        achieved: '640',
        status: 'On Track',
        target: 'Within tolerance'
      },
      {
        type: 'Workforce Housing Units',
        promised: '300',
        achieved: '285',
        status: 'At Risk',
        target: 'Behind plan'
      },
      {
        type: 'Student Participation',
        promised: '60%',
        achieved: '62%',
        status: 'On Track',
        target: 'Above target'
      },
      {
        type: 'Accreditation Reporting',
        promised: '2 reports',
        achieved: '2 submitted',
        status: 'On Track',
        target: 'Complete'
      }
    ],
    overviewItems: [
      { label: 'Institutional Compliance:', value: 'Compliant' },
      { label: 'Housing Agreements:', value: 'Active' },
      { label: 'Reporting Status:', value: 'Up to Date' },
      { label: 'Next Review:', value: 'March 2025' }
    ]
  },
  projects: {
    tableTitle: 'Campus Housing Projects Table',
    budgetSnapshotTitle: 'Campus Project Budget Snapshot',
    budgetNote:
      'Budget details are summarized for institutional oversight and do not include private financing terms.',
    riskFlagsTitle: 'Campus Project Risk Flags'
  },
  tenantParticipation: {
    topKpis: [
      { label: 'Student Participation Rate', value: '62%' },
      { label: 'Median Program Duration', value: '3.2 years' },
      { label: 'YoY Enrollment Growth', value: '+34%' }
    ],
    growthChartTitle: 'Student Participation Growth Over Time',
    aggregateValueTitle: 'Aggregate Student Participation Value',
    cohortTableTitle: 'Campus Project View (Aggregated)',
    outcomesTitle: 'Long-Term Campus Housing Outcomes',
    outcomesCopy:
      'Campus housing participation programs support student stability and workforce housing goals across institutional partnerships.',
    participationSectionTitle: 'Student & Workforce Equity & Rewards Participation',
    participationMetrics: [
      { label: 'Eligible Students:', value: '1,180' },
      { label: 'Enrolled in Programs:', value: '732 (62%)' },
      { label: 'Program Growth (12 mo):', value: '+14%' },
      { label: 'Active Participants:', value: '689' }
    ],
    economicValueTitle: 'Participation Value',
    retentionTitle: 'Housing Stability Comparison',
    retentionMetrics: [
      { label: 'Program Participants — Avg. Stay:', value: '28.4 months' },
      { label: 'Non-Participants — Avg. Stay:', value: '19.6 months' }
    ]
  },
  getHelpDescription:
    'Support resources for university housing program staff. For urgent issues, contact your KeyPath program administrator.'
}

const faithBasedPages: CommunityDashboardPageContent = {
  fiscalImpact: {
    kpiCards: [
      {
        key: 'communityBenefit',
        title: 'Community Benefit',
        value: 'High',
        subtitle: 'Aggregate benefit across ministry housing projects'
      },
      {
        key: 'housingUnitsCreated',
        title: 'Housing Units Created',
        value: '186',
        subtitle: 'Units delivered through faith-based partnerships'
      },
      {
        key: 'tenantStability',
        title: 'Resident Stability',
        value: '89%',
        subtitle: '12-month stability across ministry housing'
      },
      {
        key: 'missionImpact',
        title: 'Mission Impact',
        value: 'On Track',
        subtitle: 'Mission-aligned outcomes meeting program goals'
      }
    ],
    economicActivityTitle: 'Ministry Program Activity (Est.)',
    publicBenefitTitle: 'Mission Impact Fiscal Summary',
    bottomMetrics: [
      { label: 'Households Served', value: '186' },
      { label: 'Community Programs Active', value: '8' },
      { label: 'Stewardship Reserve Status', value: 'Stable' }
    ]
  },
  economicImpact: {
    spendOverviewTitle: 'Ministry Program Spend Overview',
    spendMetrics: [
      { label: 'Total Ministry Spend:', value: '$48.0M' },
      { label: 'Local Community Spend:', value: '$29.6M (61.7%)' },
      { label: 'Regional Spend:', value: '$11.2M (23.3%)' },
      { label: 'Outside Region:', value: '$7.2M (15%)' }
    ],
    vendorBreakdownTitle: 'Ministry Services Breakdown',
    vendorMetrics: [
      { label: 'Housing Development:', value: '$31.4M' },
      { label: 'Community Services:', value: '$8.6M' },
      { label: 'Pastoral & Support Services:', value: '$5.1M' },
      { label: 'Other Services:', value: '$2.9M' }
    ],
    localSpendTitle: 'Local vs Regional Spend',
    jobsTitle: 'Community Workforce Metrics',
    jobMetrics: [
      { label: 'Jobs Supported:', value: '146 (estimated)' },
      { label: 'Ongoing Ministry Staff:', value: '18' },
      { label: 'Local Volunteers Engaged:', value: '64%' },
      { label: 'Community Partner Participation:', value: '28%' }
    ]
  },
  compliance: {
    pledgeTableTitle: 'Stewardship Commitment Tracking',
    overviewTitle: 'Stewardship Commitments Overview',
    pledgeRows: [
      {
        type: 'Housing Units Created',
        promised: '200',
        achieved: '186',
        status: 'On Track',
        target: 'Within tolerance'
      },
      {
        type: 'Community Benefit Hours',
        promised: '5,000',
        achieved: '4,820',
        status: 'On Track',
        target: 'On schedule'
      },
      {
        type: 'Resident Support Programs',
        promised: '6 programs',
        achieved: '5 active',
        status: 'On Track',
        target: 'On schedule'
      },
      {
        type: 'Mission Reporting',
        promised: '4 reports',
        achieved: '4 submitted',
        status: 'On Track',
        target: 'Complete'
      }
    ],
    overviewItems: [
      { label: 'Stewardship Compliance:', value: 'Compliant' },
      { label: 'Housing Ministry Agreements:', value: 'Active' },
      { label: 'Reporting Status:', value: 'Up to Date' },
      { label: 'Next Review:', value: 'March 2025' }
    ]
  },
  projects: {
    tableTitle: 'Ministry Projects Table',
    budgetSnapshotTitle: 'Ministry Budget Snapshot',
    budgetNote:
      'Budget details are summarized for stewardship oversight and do not include private financing terms.',
    riskFlagsTitle: 'Ministry Project Risk Flags'
  },
  tenantParticipation: {
    topKpis: [
      { label: 'Community Members Served', value: '186' },
      { label: 'Median Program Duration', value: '3.2 years' },
      { label: 'YoY Mission Impact Growth', value: '+34%' }
    ],
    growthChartTitle: 'Community Participation Growth Over Time',
    aggregateValueTitle: 'Aggregate Mission Impact Value',
    cohortTableTitle: 'Ministry Project View (Aggregated)',
    outcomesTitle: 'Long-Term Mission Impact Outcomes',
    outcomesCopy:
      'Faith-based housing ministries are delivering planned community benefit and resident stability outcomes.',
    participationSectionTitle: 'Tenant Equity & Rewards Participation',
    participationMetrics: [
      { label: 'Eligible Community Members:', value: '1,180' },
      { label: 'Enrolled in Programs:', value: '732 (62%)' },
      { label: 'Program Growth (12 mo):', value: '+14%' },
      { label: 'Active Participants:', value: '689' }
    ],
    economicValueTitle: 'Community Benefit Value',
    retentionTitle: 'Resident Stability Comparison',
    retentionMetrics: [
      { label: 'Program Participants — Avg. Stay:', value: '28.4 months' },
      { label: 'Non-Participants — Avg. Stay:', value: '19.6 months' }
    ]
  },
  getHelpDescription:
    'Support resources for faith-based housing ministry staff. For urgent issues, contact your KeyPath program administrator.'
}

const nonprofitPages: CommunityDashboardPageContent = {
  fiscalImpact: {
    kpiCards: [
      {
        key: 'residentOutcomes',
        title: 'Resident Outcomes',
        value: 'Strong',
        subtitle: 'Outcome indicators across served populations'
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
        subtitle: '12-month retention across nonprofit programs'
      },
      {
        key: 'programParticipation',
        title: 'Program Participation',
        value: '58%',
        subtitle: 'Residents enrolled in wraparound services'
      }
    ],
    economicActivityTitle: 'Program Fiscal Activity (Est.)',
    publicBenefitTitle: 'Resident Outcomes Fiscal Summary',
    bottomMetrics: [
      { label: 'Residents Served', value: '1,046' },
      { label: 'Program Grants Deployed', value: '$12.4M' },
      { label: 'Operating Reserve Status', value: 'Stable' }
    ]
  },
  economicImpact: {
    spendOverviewTitle: 'Program Spend Overview',
    spendMetrics: [
      { label: 'Total Program Spend:', value: '$48.0M' },
      { label: 'Local Community Spend:', value: '$29.6M (61.7%)' },
      { label: 'Regional Spend:', value: '$11.2M (23.3%)' },
      { label: 'Outside Region:', value: '$7.2M (15%)' }
    ],
    vendorBreakdownTitle: 'Community Services Breakdown',
    vendorMetrics: [
      { label: 'Housing Services:', value: '$31.4M' },
      { label: 'Wraparound Services:', value: '$8.6M' },
      { label: 'Case Management:', value: '$5.1M' },
      { label: 'Other Services:', value: '$2.9M' }
    ],
    localSpendTitle: 'Local vs Regional Spend',
    jobsTitle: 'Community Workforce Metrics',
    jobMetrics: [
      { label: 'Jobs Supported:', value: '146 (estimated)' },
      { label: 'Ongoing Program Staff:', value: '18' },
      { label: 'Local Hires:', value: '64%' },
      { label: 'Diverse Vendor Participation:', value: '28%' }
    ]
  },
  compliance: {
    pledgeTableTitle: 'Program Accountability Tracking',
    overviewTitle: 'Program Commitments Overview',
    pledgeRows: [
      {
        type: 'Resident Outcomes',
        promised: '85%',
        achieved: '87%',
        status: 'On Track',
        target: 'Above target'
      },
      {
        type: 'Affordability Targets',
        promised: '85%',
        achieved: '87%',
        status: 'On Track',
        target: 'Above target'
      },
      {
        type: 'Service Delivery',
        promised: '6 programs',
        achieved: '5 active',
        status: 'On Track',
        target: 'On schedule'
      },
      {
        type: 'Grant Reporting',
        promised: '4 reports',
        achieved: '4 submitted',
        status: 'On Track',
        target: 'Complete'
      }
    ],
    overviewItems: [
      { label: 'Program Accountability:', value: 'Compliant' },
      { label: 'Service Agreements:', value: 'Active' },
      { label: 'Reporting Status:', value: 'Up to Date' },
      { label: 'Next Audit:', value: 'March 2025' }
    ]
  },
  projects: {
    tableTitle: 'Programs & Properties Table',
    budgetSnapshotTitle: 'Program Budget Snapshot',
    budgetNote:
      'Budget details are summarized for nonprofit accountability and do not include private financing terms.',
    riskFlagsTitle: 'Program Risk Flags'
  },
  tenantParticipation: {
    topKpis: [
      { label: 'Residents Served', value: '1,046' },
      { label: 'Median Program Duration', value: '3.2 years' },
      { label: 'YoY Outcome Improvement', value: '+34%' }
    ],
    growthChartTitle: 'Resident Participation Growth Over Time',
    aggregateValueTitle: 'Aggregate Resident Impact Value',
    cohortTableTitle: 'Program-Level View (Aggregated)',
    outcomesTitle: 'Long-Term Resident Outcomes',
    outcomesCopy:
      'Nonprofit housing programs demonstrate consistent resident outcome improvements and stronger stability across served populations.',
    participationSectionTitle: 'Tenant Equity & Rewards Participation',
    participationMetrics: [
      { label: 'Eligible Residents:', value: '1,180' },
      { label: 'Enrolled in Services:', value: '732 (62%)' },
      { label: 'Program Growth (12 mo):', value: '+14%' },
      { label: 'Active Participants:', value: '689' }
    ],
    economicValueTitle: 'Resident Impact Value',
    retentionTitle: 'Stability Comparison',
    retentionMetrics: [
      { label: 'Program Participants — Avg. Stay:', value: '28.4 months' },
      { label: 'Non-Participants — Avg. Stay:', value: '19.6 months' }
    ]
  },
  getHelpDescription:
    'Support resources for nonprofit program staff. For urgent issues, contact your KeyPath program administrator.'
}

const otherPages: CommunityDashboardPageContent = {
  fiscalImpact: {
    kpiCards: [
      {
        key: 'communityImpact',
        title: 'Community Impact',
        value: 'Positive',
        subtitle: 'Aggregate impact across monitored programs'
      },
      {
        key: 'housingOutcomes',
        title: 'Housing Outcomes',
        value: '1,046',
        subtitle: 'Households served across active programs'
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
        subtitle: 'Required public reports submitted on schedule'
      }
    ],
    economicActivityTitle: 'Program Economic Activity (Est.)',
    publicBenefitTitle: 'Community Impact Fiscal Summary',
    bottomMetrics: [
      { label: 'Active Programs', value: '12' },
      { label: 'Participants Served', value: '1,046' },
      { label: 'Reporting Status', value: 'Current' }
    ]
  },
  economicImpact: {
    spendOverviewTitle: 'Program Spend Overview',
    spendMetrics: [
      { label: 'Total Program Spend:', value: '$48.0M' },
      { label: 'Local Spend:', value: '$29.6M (61.7%)' },
      { label: 'Regional Spend:', value: '$11.2M (23.3%)' },
      { label: 'Outside Region:', value: '$7.2M (15%)' }
    ],
    vendorBreakdownTitle: 'Vendor Category Breakdown',
    vendorMetrics: [
      { label: 'Program Services:', value: '$31.4M' },
      { label: 'Operations:', value: '$8.6M' },
      { label: 'Professional Services:', value: '$5.1M' },
      { label: 'Other Services:', value: '$2.9M' }
    ],
    localSpendTitle: 'Local vs Regional Spend',
    jobsTitle: 'Workforce Metrics',
    jobMetrics: [
      { label: 'Jobs Supported:', value: '146 (estimated)' },
      { label: 'Ongoing Program Jobs:', value: '18' },
      { label: 'Local Participation:', value: '64%' },
      { label: 'Diverse Vendor Participation:', value: '28%' }
    ]
  },
  compliance: {
    pledgeTableTitle: 'Program Commitment Tracking',
    overviewTitle: 'Commitments Overview',
    pledgeRows: [
      {
        type: 'Housing Outcomes',
        promised: '1,100',
        achieved: '1,046',
        status: 'On Track',
        target: 'Within tolerance'
      },
      {
        type: 'Community Impact Goals',
        promised: '100%',
        achieved: '96%',
        status: 'On Track',
        target: 'Within tolerance'
      },
      {
        type: 'Program Participation',
        promised: '60%',
        achieved: '62%',
        status: 'On Track',
        target: 'Above target'
      },
      {
        type: 'Public Reporting',
        promised: '4 reports',
        achieved: '4 submitted',
        status: 'On Track',
        target: 'Complete'
      }
    ],
    overviewItems: [
      { label: 'Program Accountability:', value: 'Compliant' },
      { label: 'Program Agreements:', value: 'Active' },
      { label: 'Reporting Status:', value: 'Up to Date' },
      { label: 'Next Review:', value: 'March 2025' }
    ]
  },
  projects: {
    tableTitle: 'Programs & Projects Table',
    budgetSnapshotTitle: 'Program Budget Snapshot',
    budgetNote:
      'Budget details are summarized for program oversight and do not include private financing terms.',
    riskFlagsTitle: 'Program Risk Flags'
  },
  tenantParticipation: {
    topKpis: [
      { label: 'Participants Served', value: '1,046' },
      { label: 'Median Program Duration', value: '3.2 years' },
      { label: 'YoY Program Growth', value: '+34%' }
    ],
    growthChartTitle: 'Participation Growth Over Time',
    aggregateValueTitle: 'Aggregate Participation Value',
    cohortTableTitle: 'Program-Level View (Aggregated)',
    outcomesTitle: 'Long-Term Program Outcomes',
    outcomesCopy:
      'Community programs demonstrate consistent participation growth and improved outcomes across served populations.',
    participationSectionTitle: 'Tenant Equity & Rewards Participation',
    participationMetrics: [
      { label: 'Eligible Participants:', value: '1,180' },
      { label: 'Enrolled in Programs:', value: '732 (62%)' },
      { label: 'Program Growth (12 mo):', value: '+14%' },
      { label: 'Active Participants:', value: '689' }
    ],
    economicValueTitle: 'Participation Value',
    retentionTitle: 'Stability Comparison',
    retentionMetrics: [
      { label: 'Program Participants — Avg. Stay:', value: '28.4 months' },
      { label: 'Non-Participants — Avg. Stay:', value: '19.6 months' }
    ]
  },
  getHelpDescription:
    'Support resources for community program staff. For urgent issues, contact your KeyPath program administrator.'
}

export const communityDashboardPageContent: Record<
  CommunityDashboardConfigKey,
  CommunityDashboardPageContent
> = {
  municipality: municipalityPages,
  housingAuthority: housingAuthorityPages,
  landAuthority: landAuthorityPages,
  university: universityPages,
  faithBased: faithBasedPages,
  nonprofit: nonprofitPages,
  other: otherPages
}
