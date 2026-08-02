import { Response } from 'express';
import mongoose from 'mongoose';
import { z, ZodError } from 'zod';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import { exportDatasetForPM, PM_EXPORT_DATASETS } from '../services/propertyManagerReports.service';

const ExportQuerySchema = z.object({
  orgId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'orgId is required'),
  propertyId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
});

/** GET /api/property-manager/reports/:dataset?orgId=&propertyId= */
export async function exportDatasetHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }

    const raw = req.params.dataset as string;
    const dataset = raw.replace(/\.csv$/, '');
    if (!(PM_EXPORT_DATASETS as readonly string[]).includes(dataset)) {
      errorResponse(res, 400, 'INVALID_DATASET', `Invalid dataset. Allowed: ${PM_EXPORT_DATASETS.join(', ')}`);
      return;
    }

    const { orgId, propertyId } = ExportQuerySchema.parse(req.query);
    const csv = await exportDatasetForPM(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      orgId,
      dataset as any,
      propertyId
    );

    const filename = `${dataset}-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    if (err instanceof ZodError) {
      errorResponse(res, 400, 'VALIDATION_ERROR', err.issues[0]?.message ?? 'Validation error');
      return;
    }
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'APP_ERROR', err.message);
      return;
    }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to generate export');
  }
}
