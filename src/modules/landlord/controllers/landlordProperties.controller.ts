import { Response } from 'express';
import {
  listLandlordProperties,
  getLandlordPropertyDetail,
} from '../services/landlordProperties.service';
import { AppError } from '../../../core/errors/AppError';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';

/** BE-201: GET /landlord/properties */
export async function listLandlordPropertiesHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.auth?._id) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const result = await listLandlordProperties(req.auth._id as any, {
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
      limit: req.query.limit != null ? Number(req.query.limit) : undefined,
    });
    successResponse(res, result);
  } catch (err: any) {
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'PROPERTY_FETCH_FAILED', err.message);
      return;
    }
    errorResponse(res, 500, 'PROPERTY_FETCH_FAILED', 'Internal server error');
  }
}

/** BE-202: GET /landlord/properties/:propertyId */
export async function getLandlordPropertyDetailHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.auth?._id) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const result = await getLandlordPropertyDetail(
      req.auth._id as any,
      req.params.propertyId
    );
    successResponse(res, result);
  } catch (err: any) {
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'PROPERTY_DETAIL_FETCH_FAILED', err.message);
      return;
    }
    errorResponse(res, 500, 'PROPERTY_DETAIL_FETCH_FAILED', 'Internal server error');
  }
}
