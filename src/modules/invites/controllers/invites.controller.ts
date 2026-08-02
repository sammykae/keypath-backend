import { Request, Response } from 'express';
import { AppError } from '../../../core/errors/AppError';
import { ZodError } from 'zod';
import { successResponse, errorResponse } from '../../../core/utils/response';
import {
  createInvite,
  verifyInvite,
  sendInviteOtp,
  verifyInviteOtp,
  resendInvite,
} from '../services/tenantInvite.service';

function inviteErrorMeta(rawError: string): { code: string; status: number; resendInviteCta: boolean } {
  if (rawError === 'expired_token') {
    return { code: 'INVITE_EXPIRED', status: 400, resendInviteCta: true };
  }
  if (rawError === 'already_accepted') {
    return { code: 'INVITE_ALREADY_ACCEPTED', status: 409, resendInviteCta: false };
  }
  return { code: 'INVITE_INVALID', status: 400, resendInviteCta: false };
}

function friendlyInviteError(raw: string): string {
  if (raw === 'expired_token') return 'This invite link has expired. Please request a new one.';
  if (raw === 'already_accepted') return 'This invite has already been accepted. Please log in to your account.';
  return 'This invite link is invalid.';
}

// GET /api/invites/accept?token= — preview property/unit/lease summary, no acceptance yet
export async function previewInviteHandler(req: Request, res: Response): Promise<void> {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token : undefined;
    const code = typeof req.query.code === 'string' ? req.query.code : undefined;

    if (!token && !code) {
      errorResponse(res, 400, 'MISSING_PARAMS', 'Provide a token query parameter');
      return;
    }

    const result = await verifyInvite({ token, code } as any);

    if (!result.ok) {
      const { code: errCode, status, resendInviteCta } = inviteErrorMeta(result.error);
      errorResponse(res, status, errCode, friendlyInviteError(result.error), {
        resendInviteCta,
        ...(resendInviteCta ? { resendUrl: '/api/invites/resend' } : {}),
      });
      return;
    }

    successResponse(res, result);
  } catch (err: any) {
    if (err instanceof ZodError) {
      errorResponse(res, 400, 'VALIDATION_ERROR', err.issues.map((e) => e.message).join('; '));
      return;
    }
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'INVITE_ERROR', err.message);
      return;
    }
    console.error('previewInviteHandler error:', err);
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
}

/**
 * The OTP services signal every terminal state with a machine-readable AppError
 * message so the accept screen can render the right explanation. Those codes are
 * passed through verbatim; only the three invite-lifecycle states get the
 * friendlier INVITE_* treatment shared with the preview endpoint.
 */
function respondWithOtpError(res: Response, err: unknown, context: string): void {
  if (err instanceof AppError) {
    const raw = err.message;
    if (raw === 'expired_token' || raw === 'already_accepted' || raw === 'invalid_token') {
      const { code, status, resendInviteCta } = inviteErrorMeta(raw);
      errorResponse(res, status, code, friendlyInviteError(raw), {
        resendInviteCta,
        ...(resendInviteCta ? { resendUrl: '/api/invites/resend' } : {}),
      });
      return;
    }
    errorResponse(res, err.statusCode, raw, raw);
    return;
  }
  console.error(`${context} error:`, err);
  errorResponse(res, 500, 'INTERNAL_ERROR', 'Internal server error');
}

// POST /api/invites/send-otp — email a 6-digit code to the invited tenant
export async function sendInviteOtpHandler(req: Request, res: Response): Promise<void> {
  try {
    const { token } = req.body;
    if (!token) {
      errorResponse(res, 400, 'MISSING_TOKEN', 'token is required');
      return;
    }
    const result = await sendInviteOtp(String(token));
    successResponse(res, result);
  } catch (err) {
    respondWithOtpError(res, err, 'sendInviteOtpHandler');
  }
}

// POST /api/invites/verify-otp — accept the invite, set the password on first
// acceptance, and return a session so the tenant lands on their dashboard.
export async function verifyInviteOtpHandler(req: Request, res: Response): Promise<void> {
  try {
    const { token, otp, password } = req.body;
    if (!token || !otp) {
      errorResponse(res, 400, 'MISSING_PARAMS', 'token and otp are required');
      return;
    }
    const result = await verifyInviteOtp(
      String(token),
      String(otp),
      typeof password === 'string' ? password : undefined
    );
    successResponse(res, result);
  } catch (err) {
    respondWithOtpError(res, err, 'verifyInviteOtpHandler');
  }
}

// Kept as alias for backwards compat — same as previewInviteHandler
export const verifyInviteHandler = previewInviteHandler;

// POST /api/invites/resend — re-send the magic link email
export async function resendInviteHandler(req: Request, res: Response): Promise<void> {
  try {
    const { inviteId, email } = req.body;
    if (!inviteId && !email) {
      errorResponse(res, 400, 'MISSING_PARAMS', 'Provide inviteId or email');
      return;
    }
    const result = await resendInvite({ inviteId, email });
    successResponse(res, result);
  } catch (err: any) {
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'RESEND_FAILED', err.message);
      return;
    }
    console.error('resendInviteHandler error:', err);
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
}

// POST /api/invites — create invite (admin/landlord only)
export async function createInviteHandler(req: Request, res: Response): Promise<void> {
  try {
    const actor = (req as any).auth;
    const payload = await createInvite(req.body, { _id: actor?._id?.toString?.() });
    successResponse(res, payload, 201);
  } catch (err: any) {
    if (err instanceof ZodError) {
      errorResponse(res, 400, 'VALIDATION_ERROR', err.issues.map((e) => e.message).join('; '));
      return;
    }
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'INVITE_CREATE_FAILED', err.message);
      return;
    }
    console.error('createInviteHandler error:', err);
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
}
