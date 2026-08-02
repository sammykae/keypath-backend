import { Response } from 'express';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { getTenantTenancies } from '../services/tenantTenancies.service';
import { successResponse, errorResponse } from '../../../core/utils/response';

export async function getTenantTenanciesHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const tenantUserId = req.auth?._id?.toString();
    if (!tenantUserId) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Missing authentication');
      return;
    }
    const result = await getTenantTenancies(tenantUserId);
    successResponse(res, result);
  } catch (err: any) {
    errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}
