import PDFDocument from 'pdfkit';
import type { ReportType, ReportData } from '../types/reportEngine.types';

const PAGE_MARGIN = 40;
const PAGE_WIDTH = 612;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

function escapeCsvCell(value: string | number): string {
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(cells: (string | number)[]): string {
  return cells.map(escapeCsvCell).join(',');
}

export function reportToCsv(payload: ReportData): string {
  const { reportType, data } = payload;
  const lines: string[] = [];

  switch (reportType) {
    case 'quarterly-economic-impact': {
      lines.push('Metric,Value');
      lines.push(`Period,${data.period}`);
      lines.push(`Taxable construction spend,${data.taxableConstructionSpend}`);
      lines.push(`Vendor payment activity,${data.vendorPaymentActivity}`);
      lines.push(`Ongoing operations activity,${data.ongoingOperationsActivity}`);
      lines.push(`Estimated taxable economic activity,${data.estimatedTaxableEconomicActivity}`);
      lines.push(`Sales/use tax proxy,${data.salesUseTaxProxy}`);
      lines.push(`Payroll tax contribution,${data.payrollTaxContribution}`);
      lines.push(`Wage base generated,${data.wageBaseGenerated}`);
      if (data.propertyTax != null) lines.push(`Property tax (annual),${data.propertyTax}`);
      if (data.jobsSupported != null) lines.push(`Jobs supported,${data.jobsSupported}`);
      if (data.totalPublicBenefit != null) lines.push(`Total public benefit,${data.totalPublicBenefit}`);
      break;
    }
    case 'annual-housing-stability': {
      lines.push('Metric,Value');
      lines.push(`Total projects,${data.totalProjects}`);
      lines.push(`Units planned,${data.unitsPlanned}`);
      lines.push(`Units delivered,${data.unitsDelivered}`);
      lines.push(`Units occupied,${data.unitsOccupied}`);
      lines.push(`Occupancy rate,${(data.occupancyRate * 100).toFixed(2)}%`);
      lines.push(`Program compliance,${data.programCompliance}`);
      break;
    }
    case 'tenant-participation-summary': {
      lines.push('Summary');
      lines.push(`Overall participation rate,${(data.overallParticipationRate * 100).toFixed(2)}%`);
      lines.push(`Aggregate participation value,${data.aggregateParticipationValue}`);
      lines.push(`Active tenancies,${data.activeTenancies}`);
      lines.push(`Participating count,${data.participatingCount}`);
      lines.push('');
      lines.push(csvRow(['Entry year', 'Retention rate', 'Avg annual accumulation', 'Total cohort value']));
      data.cohorts.forEach((c) => {
        lines.push(csvRow([c.entryYear, (c.retentionRate * 100).toFixed(2) + '%', c.avgAnnualAccumulation, c.totalCohortValue]));
      });
      break;
    }
    case 'local-vendor-spend': {
      lines.push('Metric,Amount');
      lines.push(`Total project spend,${data.totalProjectSpend}`);
      lines.push(`Local city spend,${data.localCitySpend}`);
      lines.push(`State spend,${data.stateSpend}`);
      lines.push(`Non-local spend,${data.nonLocalSpend}`);
      lines.push('Category,Amount');
      lines.push(`Construction,${data.vendorCategories.construction}`);
      lines.push(`Maintenance,${data.vendorCategories.maintenance}`);
      lines.push(`Professional services,${data.vendorCategories.professionalServices}`);
      lines.push(`Other,${data.vendorCategories.other}`);
      break;
    }
    case 'fiscal-impact-summary': {
      lines.push('Metric,Value');
      lines.push(`Property tax,${data.propertyTax}`);
      lines.push(`Sales/use tax proxy,${data.salesUseTaxProxy}`);
      lines.push(`Payroll tax,${data.payrollTax}`);
      lines.push(`Jobs supported,${data.jobsSupported}`);
      lines.push(`Total public benefit,${data.totalPublicBenefit}`);
      break;
    }
  }
  return lines.join('\n');
}

function pdfTitle(doc: InstanceType<typeof PDFDocument>, title: string, y: number): number {
  doc.fontSize(16).font('Helvetica-Bold').text(title, PAGE_MARGIN, y);
  return y + 24;
}

function pdfTableRow(doc: InstanceType<typeof PDFDocument>, label: string, value: string | number, y: number): number {
  doc.font('Helvetica').fontSize(10).text(String(label), PAGE_MARGIN, y);
  doc.text(String(value), PAGE_MARGIN + 220, y, { width: CONTENT_WIDTH - 220 });
  return y + 18;
}

export async function reportToPdf(payload: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: 'LETTER', margin: PAGE_MARGIN });
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const { reportType, data } = payload;
    const reportTitles: Record<ReportType, string> = {
      'quarterly-economic-impact': 'Quarterly Economic Impact',
      'annual-housing-stability': 'Annual Housing Stability',
      'tenant-participation-summary': 'Tenant Participation Summary',
      'local-vendor-spend': 'Local Vendor Spend',
      'fiscal-impact-summary': 'Fiscal Impact Summary',
    };
    let y = 30;
    y = pdfTitle(doc, reportTitles[reportType], y);
    doc.fontSize(9).fillColor('#666666').text(`Generated ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}`, PAGE_MARGIN, y);
    y += 20;
    doc.fillColor('black');

    switch (reportType) {
      case 'quarterly-economic-impact':
        y = pdfTableRow(doc, 'Period', data.period, y);
        y = pdfTableRow(doc, 'Taxable construction spend', data.taxableConstructionSpend, y);
        y = pdfTableRow(doc, 'Vendor payment activity', data.vendorPaymentActivity, y);
        y = pdfTableRow(doc, 'Ongoing operations activity', data.ongoingOperationsActivity, y);
        y = pdfTableRow(doc, 'Estimated taxable economic activity', data.estimatedTaxableEconomicActivity, y);
        y = pdfTableRow(doc, 'Sales/use tax proxy', data.salesUseTaxProxy, y);
        y = pdfTableRow(doc, 'Payroll tax contribution', data.payrollTaxContribution, y);
        y = pdfTableRow(doc, 'Wage base generated', data.wageBaseGenerated, y);
        if (data.propertyTax != null) y = pdfTableRow(doc, 'Property tax (annual)', data.propertyTax, y);
        if (data.jobsSupported != null) y = pdfTableRow(doc, 'Jobs supported', data.jobsSupported, y);
        if (data.totalPublicBenefit != null) y = pdfTableRow(doc, 'Total public benefit', data.totalPublicBenefit, y);
        break;
      case 'annual-housing-stability':
        y = pdfTableRow(doc, 'Total projects', data.totalProjects, y);
        y = pdfTableRow(doc, 'Units planned', data.unitsPlanned, y);
        y = pdfTableRow(doc, 'Units delivered', data.unitsDelivered, y);
        y = pdfTableRow(doc, 'Units occupied', data.unitsOccupied, y);
        y = pdfTableRow(doc, 'Occupancy rate', `${(data.occupancyRate * 100).toFixed(2)}%`, y);
        y = pdfTableRow(doc, 'Program compliance', data.programCompliance, y);
        break;
      case 'tenant-participation-summary':
        y = pdfTableRow(doc, 'Overall participation rate', `${(data.overallParticipationRate * 100).toFixed(2)}%`, y);
        y = pdfTableRow(doc, 'Aggregate participation value', data.aggregateParticipationValue, y);
        y = pdfTableRow(doc, 'Active tenancies', data.activeTenancies, y);
        y = pdfTableRow(doc, 'Participating count', data.participatingCount, y);
        y += 10;
        doc.font('Helvetica-Bold').text('By cohort', PAGE_MARGIN, y);
        y += 16;
        data.cohorts.forEach((c) => {
          doc.font('Helvetica').text(`${c.entryYear}: retention ${(c.retentionRate * 100).toFixed(1)}%, avg accumulation ${c.avgAnnualAccumulation}, total value ${c.totalCohortValue}`, PAGE_MARGIN, y);
          y += 14;
        });
        break;
      case 'local-vendor-spend':
        y = pdfTableRow(doc, 'Total project spend', data.totalProjectSpend, y);
        y = pdfTableRow(doc, 'Local city spend', data.localCitySpend, y);
        y = pdfTableRow(doc, 'State spend', data.stateSpend, y);
        y = pdfTableRow(doc, 'Non-local spend', data.nonLocalSpend, y);
        y += 8;
        doc.font('Helvetica-Bold').text('By category', PAGE_MARGIN, y);
        y += 16;
        y = pdfTableRow(doc, 'Construction', data.vendorCategories.construction, y);
        y = pdfTableRow(doc, 'Maintenance', data.vendorCategories.maintenance, y);
        y = pdfTableRow(doc, 'Professional services', data.vendorCategories.professionalServices, y);
        y = pdfTableRow(doc, 'Other', data.vendorCategories.other, y);
        break;
      case 'fiscal-impact-summary':
        y = pdfTableRow(doc, 'Property tax', data.propertyTax, y);
        y = pdfTableRow(doc, 'Sales/use tax proxy', data.salesUseTaxProxy, y);
        y = pdfTableRow(doc, 'Payroll tax', data.payrollTax, y);
        y = pdfTableRow(doc, 'Jobs supported', data.jobsSupported, y);
        y = pdfTableRow(doc, 'Total public benefit', data.totalPublicBenefit, y);
        break;
    }
    doc.end();
  });
}
