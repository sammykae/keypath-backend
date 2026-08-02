import { Response } from 'express';
import { redeemReward } from '../../rewards/services/redeemReward.service';
import { RedeemRewardBodySchema } from '../dto/redeem.dto';
import { AppError } from '../../../core/errors/AppError';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { ZodError } from 'zod';

/**
 * POST /tenant/rewards/:rewardId/redeem — TENANT only. Idempotent; 409 if key reused with different payload.
 * Returns { redemptionId, remainingBalance }. 400 if insufficient balance.
 */
export async function redeemRewardHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.auth?._id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { rewardId } = req.params;
    const body = RedeemRewardBodySchema.parse(req.body);
    const result = await redeemReward({
      tenantUserId: req.auth._id as any,
      rewardId,
      idempotencyKey: body.idempotencyKey,
    });
    res.status(200).json(result);
  } catch (err: any) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.issues });
      return;
    }
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error('Unexpected error in redeem reward:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
