import { Response } from 'express';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { buildFullIndex } from '../services/search-index-builder.service';
import { SearchIndexModel } from '../models/search-index.model';

export async function triggerRebuild(req: AuthenticatedRequest, res: Response): Promise<void> {
  const result = await buildFullIndex();
  successResponse(res, { message: 'Search index rebuilt', ...result });
}

export async function getIndexStatus(_req: AuthenticatedRequest, res: Response): Promise<void> {
  const counts = await SearchIndexModel.aggregate([
    { $group: { _id: '$type', count: { $sum: 1 } } },
  ]);
  const total = await SearchIndexModel.countDocuments();
  successResponse(res, { total, byType: counts });
}
