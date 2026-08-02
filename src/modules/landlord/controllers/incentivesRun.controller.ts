import { Response } from 'express';
import { runIncentives } from '../services/incentivesRun.service';
import { AppError } from '../../../core/errors/AppError';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { z } from 'zod';

const BodySchema = z.object({
  ruleType: z.enum(['ON_TIME_RENT', 'RENEWAL', 'REFERRAL']),
  period: z.string().min(1),
});

/** BE-401: POST /landlord/incentives/run?dryRun=true|false */
export async function incentivesRunHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.auth?._id) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const dryRun = req.query.dryRun === 'true';
    const body = BodySchema.parse(req.body);
    const result = await runIncentives(
      req.auth._id as any,
      { ruleType: body.ruleType, period: body.period },
      dryRun
    );
    successResponse(res, result);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      errorResponse(res, 400, 'VALIDATION_ERROR', 'Validation error', err.issues);
      return;
    }
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'INCENTIVES_RUN_FAILED', err.message);
      return;
    }
    errorResponse(res, 500, 'INCENTIVES_RUN_FAILED', 'Internal server error');
  }
}
