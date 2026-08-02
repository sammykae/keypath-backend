import { Response } from 'express';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import { resolveLandlordOrgId } from '../../landlord/services/landlordDashboard.service';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';

const MARGIN = 40;
const PAGE_WIDTH = 612;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function row(doc: InstanceType<typeof PDFDocument>, label: string, value: string | number, y: number): number {
  doc.font('Helvetica').fontSize(10).fillColor('black').text(String(label), MARGIN, y);
  doc.text(String(value), MARGIN + 240, y, { width: CONTENT_WIDTH - 240 });
  return y + 18;
}

function sectionHeader(doc: InstanceType<typeof PDFDocument>, title: string, y: number): number {
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#1a1a1a').text(title, MARGIN, y);
  doc.moveTo(MARGIN, y + 16).lineTo(PAGE_WIDTH - MARGIN, y + 16).strokeColor('#dddddd').stroke();
  return y + 26;
}

/**
 * POST /api/reports/portfolio
 * Generates a PDF portfolio summary for the landlord's org.
 */
export async function portfolioReportHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.auth?._id as mongoose.Types.ObjectId;
    const orgId = await resolveLandlordOrgId(userId);
    const orgOid = new mongoose.Types.ObjectId(orgId);

    const properties = await PropertyModel.find({ orgId: orgOid }).lean();
    const propertyIds = properties.map((p: any) => p._id);

    const [units, tenancies] = await Promise.all([
      UnitModel.find({ propertyId: { $in: propertyIds } }).lean(),
      TenancyModel.find({ status: 'ACTIVE' }).lean(),
    ]);

    const occupiedUnitIds = new Set(tenancies.map((t: any) => t.unitId.toString()));
    const totalUnits = units.length;
    const occupiedUnits = units.filter((u: any) => occupiedUnitIds.has(u._id.toString())).length;
    const occupancyRate = totalUnits > 0 ? ((occupiedUnits / totalUnits) * 100).toFixed(1) : '0.0';

    const liveProps = properties.filter((p: any) => p.status === 'LIVE').length;
    const onboardingProps = properties.filter((p: any) => p.status === 'ONBOARDING').length;

    const date = new Date().toLocaleDateString('en-US', { dateStyle: 'long' });
    const filename = `portfolio-report-${new Date().toISOString().slice(0, 10)}.pdf`;

    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: 'LETTER', margin: MARGIN });
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => {
      const pdf = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', String(pdf.length));
      res.send(pdf);
    });
    doc.on('error', (err) => {
      console.error('[PORTFOLIO_PDF_ERROR]', err);
      if (!res.headersSent) errorResponse(res, 500, 'PDF_ERROR', 'Failed to generate PDF');
    });

    // ── Header ──────────────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#1a1a1a').text('Portfolio Report', MARGIN, 30);
    doc.font('Helvetica').fontSize(9).fillColor('#666666').text(`Generated ${date}`, MARGIN, 54);
    let y = 80;

    // ── Portfolio Overview ───────────────────────────────────────────────────────
    y = sectionHeader(doc, 'Portfolio Overview', y);
    y = row(doc, 'Total Properties', properties.length, y);
    y = row(doc, 'Live Properties', liveProps, y);
    y = row(doc, 'Onboarding Properties', onboardingProps, y);
    y = row(doc, 'Total Units', totalUnits, y);
    y = row(doc, 'Occupied Units', occupiedUnits, y);
    y = row(doc, 'Occupancy Rate', `${occupancyRate}%`, y);
    y = row(doc, 'Active Tenancies', tenancies.length, y);
    y += 16;

    // ── Property List ────────────────────────────────────────────────────────────
    y = sectionHeader(doc, 'Properties', y);
    if (properties.length === 0) {
      doc.font('Helvetica').fontSize(10).fillColor('#888888').text('No properties found.', MARGIN, y);
      y += 18;
    } else {
      for (const p of properties as any[]) {
        if (y > 700) { doc.addPage(); y = MARGIN; }
        const addr = p.address ? `${p.address.city ?? ''}, ${p.address.state ?? ''}`.replace(/^, |, $/, '') : '—';
        y = row(doc, p.name ?? p._id.toString(), `${p.status} · ${addr}`, y);
      }
    }

    doc.end();
  } catch (err: any) {
    if (err instanceof AppError) { errorResponse(res, err.statusCode, 'ERROR', err.message); return; }
    console.error('[PORTFOLIO_REPORT_ERROR]', err);
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to generate portfolio report');
  }
}
