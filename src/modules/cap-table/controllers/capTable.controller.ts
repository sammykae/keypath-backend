import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { AppError } from '../../../core/errors/AppError';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { CapTableRecalculateBody } from '../dto/capTable.dto';
import {
  computeCapTable,
  persistCapTableSnapshot,
} from '../services/capTable.service';
import { PropertyModel } from '../../properties/models/propertyModel';

export async function getCapTableHandler(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.auth?._id) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const table = await computeCapTable(
      req.params.propertyId,
      req.auth._id as mongoose.Types.ObjectId
    );
    successResponse(res, table);
  } catch (err) {
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'CAP_TABLE_ERROR', err.message);
      return;
    }
    next(err);
  }
}

export async function recalculateCapTableHandler(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.auth?._id) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const body = CapTableRecalculateBody.parse(req.body);
    const table = await computeCapTable(body.propertyId, req.auth._id as mongoose.Types.ObjectId, {
      expectedLedgerTotal: body.expectedLedgerTotal,
    });
    const prop = await PropertyModel.findById(body.propertyId).select('orgId').lean();
    if (!prop) {
      errorResponse(res, 404, 'NOT_FOUND', 'Property not found');
      return;
    }
    await persistCapTableSnapshot(prop.orgId as mongoose.Types.ObjectId, table);
    successResponse(res, {
      ...table,
      recalculated_at: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'CAP_TABLE_ERROR', err.message);
      return;
    }
    next(err);
  }
}
