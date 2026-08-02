import { Response } from 'express';
import mongoose from 'mongoose';
import { z, ZodError } from 'zod';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import {
  submitLiquidityRequest,
  reviewLiquidityRequest,
  addDeduction,
  setRofrDecision,
  setTransferStatus,
  cancelLiquidityRequest,
  getMyLiquidityRequests,
  listLiquidityRequestsForOrg,
} from '../services/liquidity.service';

const SubmitSchema = z.object({ tokens: z.number().positive() });
const ReviewSchema = z.object({
  status: z.enum(['UNDER_REVIEW', 'APPROVED', 'DENIED']),
  note: z.string().max(1000).optional(),
});
const DeductionSchema = z.object({
  amountTokens: z.number().positive(),
  reason: z.string().min(1).max(1000),
});
const RofrSchema = z.object({
  decision: z.enum(['WAIVED', 'EXERCISED']),
  note: z.string().max(1000).optional(),
});
const TransferSchema = z.object({
  status: z.enum(['PENDING', 'COMPLETED']),
  note: z.string().max(1000).optional(),
});

function handleError(res: Response, err: unknown, fallback: string): void {
  if (err instanceof ZodError) {
    errorResponse(res, 400, 'VALIDATION_ERROR', err.issues[0]?.message ?? 'Validation error');
    return;
  }
  if (err instanceof AppError) {
    errorResponse(res, err.statusCode, 'APP_ERROR', err.message);
    return;
  }
  errorResponse(res, 500, 'INTERNAL_ERROR', fallback);
}

/** POST /api/tenants/liquidity */
export async function submitLiquidityRequestHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const body = SubmitSchema.parse(req.body);
    const request = await submitLiquidityRequest(new mongoose.Types.ObjectId(req.auth._id.toString()), body);
    successResponse(res, { request }, 201);
  } catch (err) {
    handleError(res, err, 'Failed to submit liquidity request');
  }
}

/** GET /api/tenants/liquidity */
export async function getMyLiquidityRequestsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const requests = await getMyLiquidityRequests(new mongoose.Types.ObjectId(req.auth._id.toString()));
    successResponse(res, { requests });
  } catch (err) {
    handleError(res, err, 'Failed to list liquidity requests');
  }
}

/** DELETE /api/tenants/liquidity/:requestId */
export async function cancelLiquidityRequestHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const request = await cancelLiquidityRequest(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      req.params.requestId
    );
    successResponse(res, { request });
  } catch (err) {
    handleError(res, err, 'Failed to cancel liquidity request');
  }
}

/** GET /api/landlord/liquidity?status= */
export async function listLiquidityRequestsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const requests = await listLiquidityRequestsForOrg(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      { status: (req.query.status as any) || undefined }
    );
    successResponse(res, { requests });
  } catch (err) {
    handleError(res, err, 'Failed to list liquidity requests');
  }
}

/** PATCH /api/landlord/liquidity/:requestId/review */
export async function reviewLiquidityRequestHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const body = ReviewSchema.parse(req.body);
    const request = await reviewLiquidityRequest(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      req.params.requestId,
      body
    );
    successResponse(res, { request });
  } catch (err) {
    handleError(res, err, 'Failed to review liquidity request');
  }
}

/** POST /api/landlord/liquidity/:requestId/deductions */
export async function addDeductionHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const body = DeductionSchema.parse(req.body);
    const request = await addDeduction(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      req.params.requestId,
      body
    );
    successResponse(res, { request }, 201);
  } catch (err) {
    handleError(res, err, 'Failed to add deduction');
  }
}

/** PATCH /api/landlord/liquidity/:requestId/rofr */
export async function setRofrDecisionHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const body = RofrSchema.parse(req.body);
    const request = await setRofrDecision(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      req.params.requestId,
      body
    );
    successResponse(res, { request });
  } catch (err) {
    handleError(res, err, 'Failed to set ROFR decision');
  }
}

/** PATCH /api/landlord/liquidity/:requestId/transfer */
export async function setTransferStatusHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const body = TransferSchema.parse(req.body);
    const request = await setTransferStatus(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      req.params.requestId,
      body
    );
    successResponse(res, { request });
  } catch (err) {
    handleError(res, err, 'Failed to update transfer status');
  }
}
