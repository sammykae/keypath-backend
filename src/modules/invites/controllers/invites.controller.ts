import { Request, Response } from 'express';
import { AppError } from '../../../core/errors/AppError';
import { ZodError } from 'zod';
import { successResponse, errorResponse } from '../../../core/utils/response';
import {
  createInvite,
  verifyInvite,
  acceptInviteByToken,
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

// POST /api/invites/accept — confirm the magic link token, accept invite, return auth JWT
export async function confirmAcceptInviteHandler(req: Request, res: Response): Promise<void> {
  try {
    const { token } = req.body;
    if (!token) {
      errorResponse(res, 400, 'MISSING_TOKEN', 'token is required');
      return;
    }

    const result = await acceptInviteByToken(String(token));
    successResponse(res, result);
  } catch (err: any) {
    if (err instanceof AppError) {
      const { code, status, resendInviteCta } = inviteErrorMeta(err.message);
      errorResponse(res, status, code, friendlyInviteError(err.message), {
        resendInviteCta,
        ...(resendInviteCta ? { resendUrl: '/api/invites/resend' } : {}),
      });
      return;
    }
    console.error('confirmAcceptInviteHandler error:', err);
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Internal server error');
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
