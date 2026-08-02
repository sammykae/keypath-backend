import { Response } from 'express';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import { getLandlordReportKpis, listOrgUnitsByStatus } from '../services/landlordReportsKpi.service';

const VALID_UNIT_STATUSES = ['VACANT', 'OCCUPIED', 'TURN', 'OFFLINE'];

export async function getLandlordReportKpisHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.auth?._id) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const range = typeof req.query.range === 'string' ? req.query.range : undefined;
    const result = await getLandlordReportKpis(req.auth._id as any, range, req.auth.orgId);
    successResponse(res, result);
  } catch (err: any) {
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'REPORT_KPIS_FETCH_FAILED', err.message);
      return;
    }
    errorResponse(res, 500, 'REPORT_KPIS_FETCH_FAILED', 'Failed to fetch report KPIs');
  }
}

export async function listReportUnitsByStatusHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.auth?._id) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : '';
    if (!VALID_UNIT_STATUSES.includes(status)) {
      errorResponse(res, 400, 'INVALID_STATUS', `status must be one of ${VALID_UNIT_STATUSES.join(', ')}`);
      return;
    }
    const result = await listOrgUnitsByStatus(req.auth._id as any, status as any, req.auth.orgId);
    successResponse(res, { units: result });
  } catch (err: any) {
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'REPORT_UNITS_FETCH_FAILED', err.message);
      return;
    }
    errorResponse(res, 500, 'REPORT_UNITS_FETCH_FAILED', 'Failed to fetch units');
  }
}
