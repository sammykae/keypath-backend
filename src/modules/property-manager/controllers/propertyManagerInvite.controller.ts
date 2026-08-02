import { Response, Request } from 'express';
import { z, ZodError } from 'zod';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import {
  verifyPMInvite,
  sendPMInviteOtp,
  verifyPMInviteOtp,
  declinePMInvite,
} from '../services/propertyManagerInvite.service';

const TokenQuerySchema = z.object({ token: z.string().min(10) });
const OtpBodySchema = z.object({ token: z.string().min(10), otp: z.string().min(4).max(8) });

function handleError(res: Response, err: unknown, fallback: string): void {
  if (err instanceof ZodError) {
    errorResponse(res, 400, 'VALIDATION_ERROR', err.issues[0]?.message ?? 'Validation error');
    return;
  }
  if (err instanceof AppError) {
    errorResponse(res, err.statusCode, err.message.toUpperCase(), err.message);
    return;
  }
  errorResponse(res, 500, 'INTERNAL_ERROR', fallback);
}

/** GET /api/pm-invites/verify?token= — check the invite is valid before showing the activation screen. */
export async function verifyPMInviteHandler(req: Request, res: Response): Promise<void> {
  try {
    const { token } = TokenQuerySchema.parse(req.query);
    const summary = await verifyPMInvite(token);
    successResponse(res, summary);
  } catch (err) {
    handleError(res, err, 'Failed to verify invite');
  }
}

/** POST /api/pm-invites/send-otp — email a 6-digit code (rate-limited to 1 per 60s). */
export async function sendPMInviteOtpHandler(req: Request, res: Response): Promise<void> {
  try {
    const { token } = TokenQuerySchema.parse(req.body);
    const result = await sendPMInviteOtp(token);
    successResponse(res, { sent: true, email: result.email });
  } catch (err) {
    handleError(res, err, 'Failed to send verification code');
  }
}

/** POST /api/pm-invites/verify-otp — activates the PM account and returns a session token. */
export async function verifyPMInviteOtpHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = OtpBodySchema.parse(req.body);
    const result = await verifyPMInviteOtp(body.token, body.otp);
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to verify code');
  }
}

/** POST /api/pm-invites/decline — PM declines the invitation. */
export async function declinePMInviteHandler(req: Request, res: Response): Promise<void> {
  try {
    const { token } = TokenQuerySchema.parse(req.body);
    await declinePMInvite(token);
    successResponse(res, { declined: true });
  } catch (err) {
    handleError(res, err, 'Failed to decline invite');
  }
}
