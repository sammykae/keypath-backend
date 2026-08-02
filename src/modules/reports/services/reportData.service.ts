import {
  getProgramSummaryMetrics,
  getTotalPublicBenefitSummary,
  getSpendAndVendorClassification,
  getCohortLevelAggregation,
  getEconomicActivityAndTaxProxy,
} from '../../program/services/program.service';
import type {
  ReportType,
  ReportQueryParams,
  QuarterlyEconomicImpactData,
  AnnualHousingStabilityData,
  TenantParticipationSummaryData,
  LocalVendorSpendData,
  FiscalImpactSummaryData,
} from '../types/reportEngine.types';

function getQuarterBounds(year: number, quarter: number): { start: Date; end: Date } {
  const start = new Date(year, (quarter - 1) * 3, 1, 0, 0, 0, 0);
  const end = new Date(year, quarter * 3, 0, 23, 59, 59, 999);
  return { start, end };
}

export async function getReportData(
  reportType: ReportType,
  params: ReportQueryParams = {}
): Promise<
  | { reportType: ReportType; data: QuarterlyEconomicImpactData }
  | { reportType: ReportType; data: AnnualHousingStabilityData }
  | { reportType: ReportType; data: TenantParticipationSummaryData }
  | { reportType: ReportType; data: LocalVendorSpendData }
  | { reportType: ReportType; data: FiscalImpactSummaryData }
> {
  switch (reportType) {
    case 'quarterly-economic-impact': {
      let period = 'All time';
      let economic = await getEconomicActivityAndTaxProxy();
      if (params.year != null && params.quarter != null) {
        const { start, end } = getQuarterBounds(params.year, params.quarter);
        economic = await getEconomicActivityAndTaxProxy(start, end);
        period = `Q${params.quarter} ${params.year}`;
      }
      const publicBenefit = await getTotalPublicBenefitSummary();
      const data: QuarterlyEconomicImpactData = {
        period,
        ...economic,
        propertyTax: publicBenefit.propertyTax,
        jobsSupported: publicBenefit.jobsSupported,
        totalPublicBenefit: publicBenefit.totalPublicBenefit,
      };
      return { reportType, data };
    }
    case 'annual-housing-stability': {
      const m = await getProgramSummaryMetrics();
      const data: AnnualHousingStabilityData = {
        totalProjects: m.totalProjects,
        unitsPlanned: m.unitsPlanned,
        unitsDelivered: m.unitsDelivered,
        unitsOccupied: m.unitsOccupied,
        occupancyRate: m.occupancyRate,
        programCompliance: m.programCompliance,
      };
      return { reportType, data };
    }
    case 'tenant-participation-summary': {
      const [summary, cohorts] = await Promise.all([
        getProgramSummaryMetrics(),
        getCohortLevelAggregation(),
      ]);
      const participatingCount = Math.round(summary.tenantParticipationRate * summary.unitsOccupied);
      const data: TenantParticipationSummaryData = {
        overallParticipationRate: summary.tenantParticipationRate,
        aggregateParticipationValue: summary.aggregateParticipationValue,
        activeTenancies: summary.unitsOccupied,
        participatingCount,
        cohorts: cohorts.map((c) => ({
          entryYear: c.entryYear,
          retentionRate: c.retentionRate,
          avgAnnualAccumulation: c.avgAnnualAccumulation,
          totalCohortValue: c.totalCohortValue,
        })),
      };
      return { reportType, data };
    }
    case 'local-vendor-spend': {
      const s = await getSpendAndVendorClassification();
      const data: LocalVendorSpendData = {
        totalProjectSpend: s.totalProjectSpend,
        localCitySpend: s.localCitySpend,
        stateSpend: s.stateSpend,
        nonLocalSpend: s.nonLocalSpend,
        vendorCategories: s.vendorCategories,
      };
      return { reportType, data };
    }
    case 'fiscal-impact-summary': {
      const f = await getTotalPublicBenefitSummary();
      const data: FiscalImpactSummaryData = {
        propertyTax: f.propertyTax,
        salesUseTaxProxy: f.salesUseTaxProxy,
        payrollTax: f.payrollTax,
        jobsSupported: f.jobsSupported,
        totalPublicBenefit: f.totalPublicBenefit,
      };
      return { reportType, data };
    }
    default:
      throw new Error(`Unknown report type: ${reportType}`);
  }
}
