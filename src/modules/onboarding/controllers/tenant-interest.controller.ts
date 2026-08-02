import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { errorResponse, successResponse } from '../../../core/utils/response';
import {
  createTenantInterest,
  generateTenantOnboardingInviteLink,
  listTenantInterests,
  resolveTenantInviteToken,
} from '../services/tenant-interest.service';
import {
  createTenantAccountFromInvite,
  verifyTenantOtp,
  getTenantDashboardWalkthrough,
  getTenantLeaseAssociation,
  getTenantIdentityVerification,
  getTenantParticipationStatus,
  getTenantProgramExplanation,
  lookupTenantLeaseAssociation,
  saveTenantDashboardWalkthrough,
  saveTenantLeaseAssociation,
  saveTenantIdentityVerification,
  saveTenantParticipationStatus,
  saveTenantProgramExplanation,
} from '../services/tenant-onboarding.service';

function ensureAdmin(req: Request): { _id: Types.ObjectId; role: string } {
  const user = req.user as any;
  if (!user) throw new AppError('Authentication required', 401);
  if (user.role !== 'ADMIN') throw new AppError('Admin only endpoint', 403);
  return user;
}

function ensureLandlordOrAdmin(req: Request): { _id: Types.ObjectId; role: string } {
  const user = req.user as any;
  if (!user) throw new AppError('Authentication required', 401);
  if (user.role !== 'LANDLORD' && user.role !== 'ADMIN') {
    throw new AppError('Landlord or admin access required', 403);
  }
  return user;
}

export async function submitTenantInterestHandler(req: Request, res: Response) {
  try {
    const result = await createTenantInterest(req.body);
    return successResponse(
      res,
      {
        message: 'Tenant interest submitted successfully',
        interestId: result.interestId,
        status: result.status,
      },
      201
    );
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(res, err.statusCode, 'TENANT_INTEREST_SUBMIT_FAILED', err.message);
    }

    return errorResponse(res, 500, 'TENANT_INTEREST_SUBMIT_FAILED', 'Failed to submit tenant interest');
  }
}

export async function listTenantInterestHandler(req: Request, res: Response) {
  try {
    ensureLandlordOrAdmin(req);
    const status = req.query.status as 'SUBMITTED' | 'INVITE_GENERATED' | 'ONBOARDED' | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const items = await listTenantInterests({ status, limit });
    return successResponse(res, { items });
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(res, err.statusCode, 'TENANT_INTEREST_LIST_FAILED', err.message);
    }

    return errorResponse(res, 500, 'TENANT_INTEREST_LIST_FAILED', 'Failed to fetch tenant interests');
  }
}

export async function generateTenantInviteLinkHandler(req: Request, res: Response) {
  try {
    const issuingUser = ensureLandlordOrAdmin(req);
    const expiresInHours =
      req.body?.expiresInHours === undefined
        ? undefined
        : Number(req.body.expiresInHours);

    const result = await generateTenantOnboardingInviteLink(
      issuingUser._id,
      req.params.interestId as string,
      {
        expiresInHours,
        frontendUrl: req.body?.frontendUrl,
      }
    );

    return successResponse(res, {
      message: 'Tenant onboarding link generated successfully',
      ...result,
    });
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(res, err.statusCode, 'TENANT_INVITE_LINK_FAILED', err.message);
    }

    return errorResponse(res, 500, 'TENANT_INVITE_LINK_FAILED', 'Failed to generate onboarding link');
  }
}

export async function resolveTenantInviteHandler(req: Request, res: Response) {
  try {
    const token = String(req.query.token ?? '');
    const payload = await resolveTenantInviteToken(token);

    return successResponse(res, {
      message: 'Tenant onboarding invite resolved',
      ...payload,
    });
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(res, err.statusCode, 'TENANT_INVITE_RESOLVE_FAILED', err.message);
    }

    return errorResponse(res, 500, 'TENANT_INVITE_RESOLVE_FAILED', 'Failed to resolve onboarding invite');
  }
}

export async function createTenantAccountHandler(req: Request, res: Response) {
  try {
    const payload = await createTenantAccountFromInvite(req.body);
    return successResponse(
      res,
      {
        message: 'Tenant account created successfully',
        ...payload,
      },
      201
    );
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(res, err.statusCode, 'TENANT_ACCOUNT_CREATE_FAILED', err.message);
    }

    return errorResponse(res, 500, 'TENANT_ACCOUNT_CREATE_FAILED', 'Failed to create tenant account');
  }
}

export async function verifyTenantEmailOtpHandler(req: Request, res: Response) {
  try {
    const user = req.user as any;
    if (!user?._id) return errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    const { otp } = req.body as { otp?: string };
    if (!otp) return errorResponse(res, 400, 'VALIDATION_ERROR', 'otp is required');
    await verifyTenantOtp(user._id as Types.ObjectId, otp);
    return successResponse(res, { message: 'Email verified successfully' });
  } catch (err) {
    if (err instanceof AppError) return errorResponse(res, err.statusCode, 'EMAIL_VERIFY_FAILED', err.message);
    return errorResponse(res, 500, 'EMAIL_VERIFY_FAILED', 'Failed to verify email');
  }
}

export async function saveTenantIdentityVerificationHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await saveTenantIdentityVerification(user, req.body);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'TENANT_IDENTITY_VERIFICATION_SAVE_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'TENANT_IDENTITY_VERIFICATION_SAVE_FAILED',
      'Failed to save tenant identity verification'
    );
  }
}

export async function getTenantIdentityVerificationHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await getTenantIdentityVerification(user);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'TENANT_IDENTITY_VERIFICATION_FETCH_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'TENANT_IDENTITY_VERIFICATION_FETCH_FAILED',
      'Failed to fetch tenant identity verification'
    );
  }
}

export async function lookupTenantLeaseAssociationHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await lookupTenantLeaseAssociation(user, req.body);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'TENANT_LEASE_ASSOCIATION_LOOKUP_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'TENANT_LEASE_ASSOCIATION_LOOKUP_FAILED',
      'Failed to lookup tenant lease association'
    );
  }
}

export async function saveTenantLeaseAssociationHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await saveTenantLeaseAssociation(user, req.body);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'TENANT_LEASE_ASSOCIATION_SAVE_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'TENANT_LEASE_ASSOCIATION_SAVE_FAILED',
      'Failed to save tenant lease association'
    );
  }
}

export async function getTenantLeaseAssociationHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await getTenantLeaseAssociation(user);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'TENANT_LEASE_ASSOCIATION_FETCH_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'TENANT_LEASE_ASSOCIATION_FETCH_FAILED',
      'Failed to fetch tenant lease association'
    );
  }
}

export async function getTenantProgramExplanationHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await getTenantProgramExplanation(user);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'TENANT_PROGRAM_EXPLANATION_FETCH_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'TENANT_PROGRAM_EXPLANATION_FETCH_FAILED',
      'Failed to fetch tenant program explanation'
    );
  }
}

export async function saveTenantProgramExplanationHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await saveTenantProgramExplanation(user, req.body);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'TENANT_PROGRAM_EXPLANATION_SAVE_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'TENANT_PROGRAM_EXPLANATION_SAVE_FAILED',
      'Failed to save tenant program explanation'
    );
  }
}

export async function getTenantParticipationStatusHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await getTenantParticipationStatus(user);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'TENANT_PARTICIPATION_STATUS_FETCH_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'TENANT_PARTICIPATION_STATUS_FETCH_FAILED',
      'Failed to fetch tenant participation status'
    );
  }
}

export async function saveTenantParticipationStatusHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await saveTenantParticipationStatus(user);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'TENANT_PARTICIPATION_STATUS_SAVE_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'TENANT_PARTICIPATION_STATUS_SAVE_FAILED',
      'Failed to save tenant participation status'
    );
  }
}

export async function getTenantDashboardWalkthroughHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await getTenantDashboardWalkthrough(user);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'TENANT_DASHBOARD_WALKTHROUGH_FETCH_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'TENANT_DASHBOARD_WALKTHROUGH_FETCH_FAILED',
      'Failed to fetch tenant dashboard walkthrough'
    );
  }
}

export async function saveTenantDashboardWalkthroughHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await saveTenantDashboardWalkthrough(user, req.body);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'TENANT_DASHBOARD_WALKTHROUGH_SAVE_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'TENANT_DASHBOARD_WALKTHROUGH_SAVE_FAILED',
      'Failed to save tenant dashboard walkthrough'
    );
  }
}
