import { Response } from 'express';
import { listLandlordTenants } from '../services/landlordTenants.service';
import { AppError } from '../../../core/errors/AppError';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AuthenticatedRequest } from '../../auth/types/auth-request';

/** BE-203: GET /landlord/tenants */
export async function listLandlordTenantsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.auth?._id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const result = await listLandlordTenants(req.auth._id as any, {
      propertyId: typeof req.query.propertyId === 'string' ? req.query.propertyId : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
      limit: req.query.limit != null ? Number(req.query.limit) : undefined,
      expiringSoon: req.query.expiringSoon === 'true',
      hasArrears: req.query.hasArrears === 'true',
      sortBy: req.query.sortBy === 'leaseEnd' || req.query.sortBy === 'arrearsDays' ? req.query.sortBy : undefined,
      sortDir: req.query.sortDir === 'desc' ? 'desc' : req.query.sortDir === 'asc' ? 'asc' : undefined,
    });
    successResponse(res, result);
  } catch (err: any) {
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'TENANT_FETCH_FAILED', err.message);
      return;
    }
    errorResponse(res, 500, 'TENANT_FETCH_FAILED', 'Internal server error');
  }
}
