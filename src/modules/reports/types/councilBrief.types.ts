export interface CouncilBriefMetrics {
  programSummary: {
    totalProjects: number;
    unitsDelivered: number;
    unitsPlanned: number;
    unitsOccupied: number;
    occupancyRate: number;
    tenantParticipationRate: number;
    aggregateParticipationValue: number;
    programCompliance: string;
  };
  publicBenefit: {
    propertyTax: number;
    salesUseTaxProxy: number;
    payrollTax: number;
    jobsSupported: number;
    totalPublicBenefit: number;
  };
}

export interface CouncilBriefKeyTakeaway {
  label: string;
  value: string;
}
