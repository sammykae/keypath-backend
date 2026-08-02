import { Response } from 'express';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { resolveOrgIdForUser } from '../../chat/services/participantRules.service';
import { getRewards } from '../services/rewards.service';

export async function getRewardsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.auth?._id?.toString();
    const tenantOrgId = userId ? (await resolveOrgIdForUser(userId))?.toString() ?? null : null;
    const items = await getRewards(tenantOrgId);
    successResponse(res, { items });
  } catch (e) {
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to fetch rewards');
  }
}
