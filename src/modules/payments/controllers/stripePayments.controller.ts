import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { AppError } from '../../../core/errors/AppError';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { CreateStripePaymentIntentSchema } from '../dto/stripePayments.dto';
import {
  constructStripeEvent,
  createStripePaymentIntent,
  processStripeWebhookEvent,
} from '../services/stripePayments.service';

export async function createStripePaymentIntentHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.auth?._id) {
      return errorResponse(res, 401, 'UNAUTHORIZED', 'Missing or invalid authentication');
    }

    const body = CreateStripePaymentIntentSchema.parse(req.body);
    const result = await createStripePaymentIntent({
      tenantUserId: req.auth._id as any,
      ...(body.amount !== undefined ? { amount: body.amount } : {}),
      type: body.type,
      period: body.period,
      tenancyId: body.tenancyId,
    });

    successResponse(res, result, 201);
  } catch (error: any) {
    if (error instanceof ZodError) {
      return errorResponse(res, 400, 'VALIDATION_ERROR', 'Request validation failed', error.issues);
    }
    if (error instanceof AppError) {
      return errorResponse(res, error.statusCode, 'APP_ERROR', error.message);
    }
    console.error('Unexpected error in createStripePaymentIntentHandler:', error);
    return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/** Shared ingress for Stripe webhooks (/api/stripe/webhook + /api/payments/stripe/webhook). */
export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  try {
    const signature = req.headers['stripe-signature'];
    const stripeSignature = Array.isArray(signature) ? signature[0] : signature;
    const event = constructStripeEvent(stripeSignature, req.body as Buffer);
    const result = await processStripeWebhookEvent(event);
    successResponse(res, { received: true, ...result });
  } catch (error: any) {
    if (error instanceof AppError) {
      return errorResponse(res, error.statusCode, 'APP_ERROR', error.message);
    }
    if (error?.type === 'StripeSignatureVerificationError') {
      return errorResponse(res, 400, 'INVALID_SIGNATURE', 'Invalid Stripe signature');
    }
    console.error('Stripe webhook processing failed:', error);
    return errorResponse(res, 500, 'WEBHOOK_PROCESSING_FAILED', 'Failed to process webhook');
  }
}
