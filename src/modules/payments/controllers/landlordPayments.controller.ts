import { Response } from 'express';
import { ZodError } from 'zod';
import {
  listLandlordPayments,
  createLandlordPayment,
  updateLandlordPayment,
  deleteLandlordPayment,
} from '../services/landlordPayments.service';
import {
  CreatePaymentBodySchema,
  UpdatePaymentBodySchema,
  LandlordPaymentsQuerySchema,
} from '../dto/landlordPayment.dto';
import { AppError } from '../../../core/errors/AppError';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AuthenticatedRequest } from '../../auth/types/auth-request';

/**
 * GET /landlord/payments — list payments (landlord/admin, org-scoped)
 */
export async function listPaymentsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.auth?._id;
    if (!userId) {
      return errorResponse(res, 401, 'UNAUTHORIZED', 'Missing or invalid authentication');
    }
    const query = LandlordPaymentsQuerySchema.parse(req.query);
    const raw = req.query.orgId ?? req.headers['x-org-id'];
    const authOrgId = Array.isArray(raw) ? raw[0] : raw;
    const result = await listLandlordPayments(userId as any, query, authOrgId as string | null | undefined);
    successResponse(res, result);
  } catch (err: any) {
    if (err instanceof ZodError) {
      return errorResponse(res, 400, 'VALIDATION_ERROR', 'Request validation failed', err.issues);
    }
    if (err instanceof AppError) {
      return errorResponse(res, err.statusCode, 'APP_ERROR', err.message);
    }
    console.error('Unexpected error in list landlord payments:', err);
    return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * POST /landlord/payments — create payment (landlord/admin, org-scoped)
 */
export async function createPaymentHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.auth?._id;
    if (!userId) {
      return errorResponse(res, 401, 'UNAUTHORIZED', 'Missing or invalid authentication');
    }
    const body = CreatePaymentBodySchema.parse(req.body);
    const raw = req.query.orgId ?? req.headers['x-org-id'];
    const authOrgId = Array.isArray(raw) ? raw[0] : raw;
    const result = await createLandlordPayment(userId as any, body, authOrgId as string | null | undefined);
    successResponse(res, result, 201);
  } catch (err: any) {
    if (err instanceof ZodError) {
      return errorResponse(res, 400, 'VALIDATION_ERROR', 'Request validation failed', err.issues);
    }
    if (err instanceof AppError) {
      return errorResponse(res, err.statusCode, 'APP_ERROR', err.message);
    }
    console.error('Unexpected error in create payment:', err);
    return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * PATCH /landlord/payments/:paymentId — update payment (landlord/admin, org-scoped)
 */
export async function updatePaymentHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.auth?._id;
    if (!userId) {
      return errorResponse(res, 401, 'UNAUTHORIZED', 'Missing or invalid authentication');
    }
    const paymentId = req.params.paymentId;
    const body = UpdatePaymentBodySchema.parse(req.body);
    const raw = req.query.orgId ?? req.headers['x-org-id'];
    const authOrgId = Array.isArray(raw) ? raw[0] : raw;
    const result = await updateLandlordPayment(userId as any, paymentId, body, authOrgId as string | null | undefined);
    successResponse(res, result);
  } catch (err: any) {
    if (err instanceof ZodError) {
      return errorResponse(res, 400, 'VALIDATION_ERROR', 'Request validation failed', err.issues);
    }
    if (err instanceof AppError) {
      return errorResponse(res, err.statusCode, 'APP_ERROR', err.message);
    }
    console.error('Unexpected error in update payment:', err);
    return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * DELETE /landlord/payments/:paymentId — delete payment (landlord/admin, org-scoped)
 */
export async function deletePaymentHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.auth?._id;
    if (!userId) {
      return errorResponse(res, 401, 'UNAUTHORIZED', 'Missing or invalid authentication');
    }
    const paymentId = req.params.paymentId;
    const raw = req.query.orgId ?? req.headers['x-org-id'];
    const authOrgId = Array.isArray(raw) ? raw[0] : raw;
    await deleteLandlordPayment(userId as any, paymentId, authOrgId as string | null | undefined);
    successResponse(res, { message: 'Successfully deleted' });
  } catch (err: any) {
    if (err instanceof AppError) {
      return errorResponse(res, err.statusCode, 'APP_ERROR', err.message);
    }
    console.error('Unexpected error in delete payment:', err);
    return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}
