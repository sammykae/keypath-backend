import { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { logClick } from '../services/search-log.service';
import { logOwnershipGuard } from '../../search/guards/search-access.guard';

const ClickSchema = z.object({
  logId: z.string().min(1),
  resultType: z.string().min(1),
  label: z.string().min(1),
  route: z.string().min(1),
  rank: z.number().int().min(0),
});

export async function trackClick(req: AuthenticatedRequest, res: Response): Promise<void> {
  const parsed = ClickSchema.safeParse(req.body);
  if (!parsed.success) {
    errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid click payload', parsed.error.flatten());
    return;
  }

  const { logId, ...clicked } = parsed.data;
  const userId = String(req.auth!._id);

  const owns = await logOwnershipGuard(logId, userId);
  if (!owns) {
    errorResponse(res, 403, 'FORBIDDEN', 'Log entry not found or does not belong to you');
    return;
  }

  await logClick(logId, clicked);
  successResponse(res, { recorded: true });
}
