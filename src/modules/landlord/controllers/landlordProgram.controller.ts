import { Response } from 'express';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import { getLandlordPropertyProgram, pauseTokenization, resumeTokenization } from '../services/landlordProgram.service';

export async function getLandlordProgramHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.auth?._id) {
    errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return;
  }
  const propertyId = req.params.propertyId as string;
  const result = await getLandlordPropertyProgram(req.auth._id as any, propertyId);
  successResponse(res, result);
}

export async function pauseTokenizationHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.auth?._id) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const propertyId = req.params.propertyId as string;
    const result = await pauseTokenization(req.auth._id as any, propertyId);
    successResponse(res, result);
  } catch (err: any) {
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'PAUSE_FAILED', err.message);
      return;
    }
    errorResponse(res, 500, 'PAUSE_FAILED', 'Failed to pause tokenization');
  }
}

export async function resumeTokenizationHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.auth?._id) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const propertyId = req.params.propertyId as string;
    const result = await resumeTokenization(req.auth._id as any, propertyId);
    successResponse(res, result);
  } catch (err: any) {
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'RESUME_FAILED', err.message);
      return;
    }
    errorResponse(res, 500, 'RESUME_FAILED', 'Failed to resume tokenization');
  }
}
