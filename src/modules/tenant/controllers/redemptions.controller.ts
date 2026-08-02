import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { RedemptionModel } from '../../rewards/models/redemption.model';
import { RewardCatalogModel } from '../models/rewardCatalog.model';

/**
 * GET /api/tenants/rewards/redemptions
 * Returns the tenant's past redemptions with reward title + fulfillment details.
 */
export async function getRedemptionsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }

    const tenantUserId = new mongoose.Types.ObjectId(req.auth._id.toString());
    const redemptions = await RedemptionModel.find({ tenantUserId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const catalogIds = redemptions.map((r: any) => r.rewardId);
    const catalogs = await RewardCatalogModel.find({ _id: { $in: catalogIds } }).lean();
    const catalogMap = new Map(catalogs.map((c: any) => [c._id.toString(), c]));

    const items = redemptions.map((r: any) => {
      const catalog = catalogMap.get(r.rewardId.toString());
      return {
        redemptionId: r._id.toString(),
        rewardId: catalog?.rewardId ?? null,
        rewardTitle: catalog?.title ?? 'Unknown Reward',
        category: catalog?.category ?? '',
        tokensSpent: r.amount,
        redeemedAt: r.createdAt,
        fulfillment: r.fulfillment ?? null,
      };
    });

    successResponse(res, { items });
  } catch (e) {
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to fetch redemptions');
  }
}
