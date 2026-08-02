import { Request, Response } from 'express';
import { getReportData } from '../services/reportData.service';
import { reportToCsv, reportToPdf } from '../services/reportExport.service';
import { REPORT_TYPES, REPORT_FORMATS, type ReportData } from '../types/reportEngine.types';
import { AppError } from '../../../core/errors/AppError';
import { errorResponse } from '../../../core/utils/response';

function parseYearQuarter(req: Request): { year?: number; quarter?: number } {
  const yearStr = req.query.year as string | undefined;
  const quarterStr = req.query.quarter as string | undefined;
  const year = yearStr != null ? parseInt(yearStr, 10) : undefined;
  const quarter = quarterStr != null ? parseInt(quarterStr, 10) : undefined;
  if (yearStr != null && (year === undefined || Number.isNaN(year) || year < 2000 || year > 2100)) {
    throw new AppError('Invalid year query parameter', 400);
  }
  if (quarterStr != null && (quarter === undefined || Number.isNaN(quarter) || quarter < 1 || quarter > 4)) {
    throw new AppError('Invalid quarter query parameter (1–4)', 400);
  }
  return { year, quarter };
}

export async function reportEngineHandler(req: Request, res: Response): Promise<void> {
  try {
    const reportType = req.params.reportType as string;
    if (!REPORT_TYPES.includes(reportType as any)) {
      errorResponse(res, 400, 'BAD_REQUEST', `Invalid report type. Allowed: ${REPORT_TYPES.join(', ')}`);
      return;
    }
    const format = (req.query.format as string) || 'csv';
    if (!REPORT_FORMATS.includes(format as any)) {
      errorResponse(res, 400, 'BAD_REQUEST', `Invalid format. Allowed: ${REPORT_FORMATS.join(', ')}`);
      return;
    }
    const { year, quarter } = parseYearQuarter(req);

    const payload = await getReportData(reportType as any, { format: format as any, year, quarter }) as ReportData;

    const slug = reportType.replace(/\s+/g, '-');
    const date = new Date().toISOString().slice(0, 10);

    if (format === 'csv') {
      const csv = reportToCsv(payload);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${slug}-${date}.csv"`);
      res.send(csv);
      return;
    }

    const pdfBuffer = await reportToPdf(payload);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}-${date}.pdf"`);
    res.setHeader('Content-Length', String(pdfBuffer.length));
    res.send(pdfBuffer);
  } catch (err) {
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'REPORT_ERROR', err.message);
      return;
    }
    console.error('Report engine error:', err);
    errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to generate report');
  }
}
