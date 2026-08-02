import { Response } from 'express';
import mongoose from 'mongoose';
import { z, ZodError } from 'zod';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import { getVestingSummary, runMonthlyAccrual } from '../services/vesting.service';

const RunAccrualSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, 'period must be YYYY-MM'),
});

function handleError(res: Response, err: unknown, fallback: string): void {
  if (err instanceof ZodError) {
    errorResponse(res, 400, 'VALIDATION_ERROR', err.issues[0]?.message ?? 'Validation error');
    return;
  }
  if (err instanceof AppError) {
    errorResponse(res, err.statusCode, 'APP_ERROR', err.message);
    return;
  }
  errorResponse(res, 500, 'INTERNAL_ERROR', fallback);
}

/** GET /api/tenants/tokens/vesting */
export async function getVestingSummaryHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const summary = await getVestingSummary(new mongoose.Types.ObjectId(req.auth._id.toString()));
    successResponse(res, { vesting: summary });
  } catch (err) {
    handleError(res, err, 'Failed to fetch vesting summary');
  }
}

/** POST /api/landlord/tokens/accrual/run?dryRun=true */
export async function runMonthlyAccrualHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const body = RunAccrualSchema.parse(req.body);
    const dryRun = req.query.dryRun !== 'false'; // default: preview
    const result = await runMonthlyAccrual(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      body.period,
      dryRun
    );
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to run monthly accrual');
  }
}
