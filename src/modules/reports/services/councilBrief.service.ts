import PDFDocument from 'pdfkit';
import { getProgramSummaryMetrics, getTotalPublicBenefitSummary } from '../../program/services/program.service';
import type { CouncilBriefMetrics, CouncilBriefKeyTakeaway } from '../types/councilBrief.types';

const PAGE_MARGIN = 40;
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

function buildKeyTakeaways(metrics: CouncilBriefMetrics): CouncilBriefKeyTakeaway[] {
  const { programSummary, publicBenefit } = metrics;
  const takeaways: CouncilBriefKeyTakeaway[] = [];

  takeaways.push({
    label: 'Housing delivery',
    value: `${programSummary.unitsOccupied} of ${programSummary.unitsDelivered || programSummary.unitsPlanned} units occupied (${(programSummary.occupancyRate * 100).toFixed(1)}%)`,
  });
  takeaways.push({
    label: 'Tenant participation',
    value: `${(programSummary.tenantParticipationRate * 100).toFixed(1)}% of active tenancies participating in program`,
  });
  takeaways.push({
    label: 'Program compliance',
    value: programSummary.programCompliance,
  });
  takeaways.push({
    label: 'Public benefit (annual)',
    value: `$${publicBenefit.totalPublicBenefit.toLocaleString()} (property tax, sales/payroll proxy)`,
  });
  takeaways.push({
    label: 'Jobs supported',
    value: `${publicBenefit.jobsSupported} jobs supported across projects`,
  });
  return takeaways;
}

function drawBar(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  width: number,
  height: number,
  fillPercent: number,
  color: string
) {
  const barWidth = Math.max(0, Math.min(1, fillPercent)) * width;
  doc.rect(x, y, width, height).stroke('#e0e0e0');
  doc.rect(x, y, barWidth, height).fill(color);
}

export async function getCouncilBriefMetrics(): Promise<CouncilBriefMetrics> {
  const [programSummary, publicBenefit] = await Promise.all([
    getProgramSummaryMetrics(),
    getTotalPublicBenefitSummary(),
  ]);
  return { programSummary, publicBenefit };
}

export async function generateCouncilBriefPdf(): Promise<Buffer> {
  const metrics = await getCouncilBriefMetrics();
  const takeaways = buildKeyTakeaways(metrics);

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: 'LETTER', margin: PAGE_MARGIN });
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let y = 30;

    doc.fontSize(22).font('Helvetica-Bold').text('City Council Brief', { align: 'center' });
    y += 32;
    doc.fontSize(9).font('Helvetica').fillColor('#666666').text(`Generated ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}`, { align: 'center' });
    y += 20;

    doc.fontSize(11).fillColor('black').font('Helvetica-Bold').text('Key metrics', PAGE_MARGIN, y);
    y += 18;

    doc.font('Helvetica').fontSize(9);
    const metricsLines = [
      `Projects: ${metrics.programSummary.totalProjects}  |  Units delivered: ${metrics.programSummary.unitsDelivered}  |  Units planned: ${metrics.programSummary.unitsPlanned}`,
      `Occupied units: ${metrics.programSummary.unitsOccupied}  |  Occupancy rate: ${(metrics.programSummary.occupancyRate * 100).toFixed(1)}%  |  Tenant participation: ${(metrics.programSummary.tenantParticipationRate * 100).toFixed(1)}%`,
      `Program compliance: ${metrics.programSummary.programCompliance}  |  Aggregate participation value: $${metrics.programSummary.aggregateParticipationValue.toLocaleString()}`,
      `Property tax (annual): $${metrics.publicBenefit.propertyTax.toLocaleString()}  |  Sales/use tax proxy: $${metrics.publicBenefit.salesUseTaxProxy.toLocaleString()}  |  Payroll tax: $${metrics.publicBenefit.payrollTax.toLocaleString()}`,
      `Jobs supported: ${metrics.publicBenefit.jobsSupported}  |  Total public benefit: $${metrics.publicBenefit.totalPublicBenefit.toLocaleString()}`,
    ];
    metricsLines.forEach((line) => {
      doc.text(line, PAGE_MARGIN, y, { width: CONTENT_WIDTH });
      y += 16;
    });
    y += 8;

    doc.font('Helvetica-Bold').fontSize(10).text('Charts', PAGE_MARGIN, y);
    y += 16;

    const chartLeft = PAGE_MARGIN;
    const chartBarWidth = 200;
    const chartBarHeight = 14;
    const chartGap = 22;

    doc.font('Helvetica').fontSize(9).fillColor('black').text('Occupancy rate', chartLeft, y);
    y += 6;
    drawBar(doc, chartLeft, y, chartBarWidth, chartBarHeight, metrics.programSummary.occupancyRate, '#2563eb');
    doc.text(`${(metrics.programSummary.occupancyRate * 100).toFixed(1)}%`, chartLeft + chartBarWidth + 10, y + 2);
    y += chartBarHeight + chartGap;

    doc.text('Tenant participation rate', chartLeft, y);
    y += 6;
    drawBar(doc, chartLeft, y, chartBarWidth, chartBarHeight, metrics.programSummary.tenantParticipationRate, '#059669');
    doc.text(`${(metrics.programSummary.tenantParticipationRate * 100).toFixed(1)}%`, chartLeft + chartBarWidth + 10, y + 2);
    y += chartBarHeight + chartGap;

    y += 10;
    doc.font('Helvetica-Bold').fontSize(10).text('Key takeaways', PAGE_MARGIN, y);
    y += 18;

    doc.font('Helvetica').fontSize(9);
    takeaways.forEach((t) => {
      if (y > PAGE_HEIGHT - 80) return;
      doc.text(`• ${t.label}: ${t.value}`, PAGE_MARGIN, y, { width: CONTENT_WIDTH });
      y += 20;
    });

    doc.end();
  });
}
