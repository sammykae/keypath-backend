export const REPORT_TYPES = [
  'quarterly-economic-impact',
  'annual-housing-stability',
  'tenant-participation-summary',
  'local-vendor-spend',
  'fiscal-impact-summary',
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_FORMATS = ['pdf', 'csv'] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

export interface ReportQueryParams {
  format?: ReportFormat;
  year?: number;
  quarter?: number;
}

export interface QuarterlyEconomicImpactData {
  period: string;
  taxableConstructionSpend: number;
  vendorPaymentActivity: number;
  ongoingOperationsActivity: number;
  estimatedTaxableEconomicActivity: number;
  salesUseTaxProxy: number;
  payrollTaxContribution: number;
  wageBaseGenerated: number;
  propertyTax?: number;
  jobsSupported?: number;
  totalPublicBenefit?: number;
}

export interface AnnualHousingStabilityData {
  totalProjects: number;
  unitsPlanned: number;
  unitsDelivered: number;
  unitsOccupied: number;
  occupancyRate: number;
  programCompliance: string;
}

export interface TenantParticipationSummaryRow {
  entryYear: number;
  retentionRate: number;
  avgAnnualAccumulation: number;
  totalCohortValue: number;
}

export interface TenantParticipationSummaryData {
  overallParticipationRate: number;
  aggregateParticipationValue: number;
  activeTenancies: number;
  participatingCount: number;
  cohorts: TenantParticipationSummaryRow[];
}

export interface LocalVendorSpendData {
  totalProjectSpend: number;
  localCitySpend: number;
  stateSpend: number;
  nonLocalSpend: number;
  vendorCategories: {
    construction: number;
    maintenance: number;
    professionalServices: number;
    other: number;
  };
}

export interface FiscalImpactSummaryData {
  propertyTax: number;
  salesUseTaxProxy: number;
  payrollTax: number;
  jobsSupported: number;
  totalPublicBenefit: number;
}

export type ReportData =
  | { reportType: 'quarterly-economic-impact'; data: QuarterlyEconomicImpactData }
  | { reportType: 'annual-housing-stability'; data: AnnualHousingStabilityData }
  | { reportType: 'tenant-participation-summary'; data: TenantParticipationSummaryData }
  | { reportType: 'local-vendor-spend'; data: LocalVendorSpendData }
  | { reportType: 'fiscal-impact-summary'; data: FiscalImpactSummaryData };
