import { Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../../core/errors/AppError';
import { errorResponse, successResponse } from '../../../core/utils/response';
import { requestPasswordReset, resetPassword } from '../services/forgot-password.service';

const forgotSchema = z.object({
  email: z.string().email()
});

const resetSchema = z.object({
  email: z.string().email(),
  otp: z.string().min(1),
  newPassword: z.string().min(8)
});

export async function forgotPasswordHandler(req: Request, res: Response) {
  try {
    const parsed = forgotSchema.safeParse(req.body);
    if (!parsed.success) {
      return errorResponse(res, 400, 'VALIDATION_ERROR', 'A valid email address is required');
    }
    await requestPasswordReset(parsed.data.email);
    return successResponse(res, {
      message: 'If an account with that email exists, a reset code has been sent.'
    });
  } catch (err) {
    if (err instanceof AppError) return errorResponse(res, err.statusCode, 'FORGOT_PASSWORD_FAILED', err.message);
    return errorResponse(res, 500, 'FORGOT_PASSWORD_FAILED', 'Something went wrong');
  }
}

export async function resetPasswordHandler(req: Request, res: Response) {
  try {
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Invalid request';
      return errorResponse(res, 400, 'VALIDATION_ERROR', msg);
    }
    const { email, otp, newPassword } = parsed.data;
    await resetPassword(email, otp, newPassword);
    return successResponse(res, { message: 'Password reset successfully. You can now sign in.' });
  } catch (err) {
    if (err instanceof AppError) return errorResponse(res, err.statusCode, 'RESET_PASSWORD_FAILED', err.message);
    return errorResponse(res, 500, 'RESET_PASSWORD_FAILED', 'Something went wrong');
  }
}
