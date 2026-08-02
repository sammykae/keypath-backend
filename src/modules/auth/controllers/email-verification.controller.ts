import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import {
  verifyEmailToken,
  resendVerificationEmail,
} from '../services/email-verification.service';
import { Types } from 'mongoose';

export async function verifyEmailHandler(req: Request, res: Response): Promise<void> {
  const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  if (!token) {
    errorResponse(res, 400, 'MISSING_TOKEN', 'Verification token is required');
    return;
  }

  try {
    const result = await verifyEmailToken(token);
    successResponse(res, { message: 'Email verified successfully', userId: result.userId, email: result.email });
  } catch (err) {
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'VERIFICATION_FAILED', err.message);
      return;
    }
    errorResponse(res, 500, 'VERIFICATION_FAILED', 'Failed to verify email');
  }
}

export async function resendVerificationEmailHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.auth) {
    errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return;
  }

  try {
    await resendVerificationEmail(req.auth._id as Types.ObjectId);
    successResponse(res, { message: 'Verification email sent' });
  } catch (err) {
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'RESEND_FAILED', err.message);
      return;
    }
    errorResponse(res, 500, 'RESEND_FAILED', 'Failed to send verification email');
  }
}
