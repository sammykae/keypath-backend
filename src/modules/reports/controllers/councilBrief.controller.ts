import { Request, Response } from 'express';
import { generateCouncilBriefPdf } from '../services/councilBrief.service';
import { AppError } from '../../../core/errors/AppError';
import { errorResponse } from '../../../core/utils/response';

export async function councilBriefHandler(_req: Request, res: Response): Promise<void> {
  try {
    const pdfBuffer = await generateCouncilBriefPdf();
    const filename = `city-council-brief-${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(pdfBuffer.length));
    res.send(pdfBuffer);
  } catch (err) {
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'COUNCIL_BRIEF_ERROR', err.message);
      return;
    }
    console.error('Council brief generation error:', err);
    errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to generate council brief PDF');
  }
}
