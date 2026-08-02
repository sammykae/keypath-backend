import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { errorResponse, successResponse } from '../../../core/utils/response';
import {
  createInvestorInterest,
  generateInvestorOnboardingInviteLink,
  listInvestorInterests,
  resolveInvestorInviteToken,
} from '../services/investor-interest.service';
import {
  createInvestorAccountFromInvite,
  verifyInvestorOtp,
  getInvestorAllSet,
  getInvestorInvestmentPreferences,
  getInvestorLegalAcknowledgments,
  getInvestorStatusAcknowledgment,
  saveInvestorAllSet,
  saveInvestorInvestmentPreferences,
  saveInvestorLegalAcknowledgments,
  saveInvestorStatusAcknowledgment,
} from '../services/investor-onboarding.service';

function ensureAdmin(req: Request): { _id: Types.ObjectId; role: string } {
  const user = req.user as any;
  if (!user) {
    throw new AppError('Authentication required', 401);
  }

  if (user.role !== 'ADMIN') {
    throw new AppError('Admin only endpoint', 403);
  }

  return user;
}

export async function submitInvestorInterestHandler(
  req: Request,
  res: Response
) {
  try {
    const result = await createInvestorInterest(req.body);
    return successResponse(
      res,
      {
        message: 'Investor interest submitted successfully',
        interestId: result.interestId,
        status: result.status,
      },
      201
    );
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'INVESTOR_INTEREST_SUBMIT_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'INVESTOR_INTEREST_SUBMIT_FAILED',
      'Failed to submit investor interest'
    );
  }
}

export async function listInvestorInterestHandler(
  req: Request,
  res: Response
) {
  try {
    ensureAdmin(req);
    const status = req.query.status as
      | 'SUBMITTED'
      | 'INVITE_GENERATED'
      | 'ONBOARDED'
      | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const items = await listInvestorInterests({ status, limit });
    return successResponse(res, { items });
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'INVESTOR_INTEREST_LIST_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'INVESTOR_INTEREST_LIST_FAILED',
      'Failed to fetch investor interests'
    );
  }
}

export async function generateInvestorInviteLinkHandler(
  req: Request,
  res: Response
) {
  try {
    const adminUser = ensureAdmin(req);
    const expiresInHours =
      req.body?.expiresInHours === undefined
        ? undefined
        : Number(req.body.expiresInHours);

    const result = await generateInvestorOnboardingInviteLink(
      adminUser._id,
      req.params.interestId as string,
      {
        expiresInHours,
        frontendUrl: req.body?.frontendUrl,
      }
    );

    return successResponse(res, {
      message: 'Investor onboarding link generated successfully',
      ...result,
    });
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'INVESTOR_INVITE_LINK_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'INVESTOR_INVITE_LINK_FAILED',
      'Failed to generate investor onboarding link'
    );
  }
}

export async function resolveInvestorInviteHandler(
  req: Request,
  res: Response
) {
  try {
    const token = String(req.query.token ?? '');
    const payload = await resolveInvestorInviteToken(token);

    return successResponse(res, {
      message: 'Investor onboarding invite resolved',
      ...payload,
    });
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'INVESTOR_INVITE_RESOLVE_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'INVESTOR_INVITE_RESOLVE_FAILED',
      'Failed to resolve investor onboarding invite'
    );
  }
}

export async function createInvestorAccountHandler(
  req: Request,
  res: Response
) {
  try {
    const payload = await createInvestorAccountFromInvite(req.body);
    return successResponse(
      res,
      {
        message: 'Investor account created successfully',
        ...payload,
      },
      201
    );
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'INVESTOR_ACCOUNT_CREATE_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'INVESTOR_ACCOUNT_CREATE_FAILED',
      'Failed to create investor account'
    );
  }
}

export async function verifyInvestorEmailOtpHandler(req: Request, res: Response) {
  try {
    const user = req.user as any;
    if (!user?._id) return errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    const { otp } = req.body as { otp?: string };
    if (!otp) return errorResponse(res, 400, 'VALIDATION_ERROR', 'otp is required');
    await verifyInvestorOtp(user._id as Types.ObjectId, otp);
    return successResponse(res, { message: 'Email verified successfully' });
  } catch (err) {
    if (err instanceof AppError) return errorResponse(res, err.statusCode, 'EMAIL_VERIFY_FAILED', err.message);
    return errorResponse(res, 500, 'EMAIL_VERIFY_FAILED', 'Failed to verify email');
  }
}

export async function getInvestorStatusAcknowledgmentHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await getInvestorStatusAcknowledgment(user);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'INVESTOR_STATUS_ACKNOWLEDGMENT_FETCH_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'INVESTOR_STATUS_ACKNOWLEDGMENT_FETCH_FAILED',
      'Failed to fetch investor status acknowledgment'
    );
  }
}

export async function saveInvestorStatusAcknowledgmentHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await saveInvestorStatusAcknowledgment(user, req.body);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'INVESTOR_STATUS_ACKNOWLEDGMENT_SAVE_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'INVESTOR_STATUS_ACKNOWLEDGMENT_SAVE_FAILED',
      'Failed to save investor status acknowledgment'
    );
  }
}

export async function getInvestorInvestmentPreferencesHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await getInvestorInvestmentPreferences(user);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'INVESTOR_INVESTMENT_PREFERENCES_FETCH_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'INVESTOR_INVESTMENT_PREFERENCES_FETCH_FAILED',
      'Failed to fetch investor investment preferences'
    );
  }
}

export async function saveInvestorInvestmentPreferencesHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await saveInvestorInvestmentPreferences(user, req.body);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'INVESTOR_INVESTMENT_PREFERENCES_SAVE_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'INVESTOR_INVESTMENT_PREFERENCES_SAVE_FAILED',
      'Failed to save investor investment preferences'
    );
  }
}

export async function getInvestorLegalAcknowledgmentsHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await getInvestorLegalAcknowledgments(user);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'INVESTOR_LEGAL_ACKNOWLEDGMENTS_FETCH_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'INVESTOR_LEGAL_ACKNOWLEDGMENTS_FETCH_FAILED',
      'Failed to fetch investor legal acknowledgments'
    );
  }
}

export async function saveInvestorLegalAcknowledgmentsHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await saveInvestorLegalAcknowledgments(user, req.body);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'INVESTOR_LEGAL_ACKNOWLEDGMENTS_SAVE_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'INVESTOR_LEGAL_ACKNOWLEDGMENTS_SAVE_FAILED',
      'Failed to save investor legal acknowledgments'
    );
  }
}

export async function getInvestorAllSetHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await getInvestorAllSet(user);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'INVESTOR_ALL_SET_FETCH_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'INVESTOR_ALL_SET_FETCH_FAILED',
      'Failed to fetch investor completion summary'
    );
  }
}

export async function saveInvestorAllSetHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await saveInvestorAllSet(user, req.body);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'INVESTOR_ALL_SET_SAVE_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'INVESTOR_ALL_SET_SAVE_FAILED',
      'Failed to complete investor onboarding'
    );
  }
}
