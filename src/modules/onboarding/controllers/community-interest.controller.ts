import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { errorResponse, successResponse } from '../../../core/utils/response';
import {
  createCommunityInterest,
  generateCommunityOnboardingInviteLink,
  listCommunityInterests,
  resolveCommunityInviteToken,
} from '../services/community-interest.service';
import {
  createCommunityAccountFromInvite,
  verifyCommunityOtp,
  getCommunityDataVisibilityPrivacy,
  getCommunityImpactGoals,
  getCommunityOrganizationInformation,
  getCommunityProgramAssociation,
  getCommunityReviewActivate,
  getCommunityStakeholderType,
  getCommunityStakeholderDashboardProfile,
  saveCommunityDataVisibilityPrivacy,
  saveCommunityImpactGoals,
  saveCommunityOrganizationInformation,
  saveCommunityProgramAssociation,
  saveCommunityReviewActivate,
  saveCommunityStakeholderType,
} from '../services/community-onboarding.service';

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

export async function submitCommunityInterestHandler(
  req: Request,
  res: Response
) {
  try {
    const result = await createCommunityInterest(req.body);
    return successResponse(
      res,
      {
        message: 'Community interest submitted successfully',
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
        'COMMUNITY_INTEREST_SUBMIT_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'COMMUNITY_INTEREST_SUBMIT_FAILED',
      'Failed to submit community interest'
    );
  }
}

export async function listCommunityInterestHandler(
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

    const items = await listCommunityInterests({ status, limit });
    return successResponse(res, { items });
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'COMMUNITY_INTEREST_LIST_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'COMMUNITY_INTEREST_LIST_FAILED',
      'Failed to fetch community interests'
    );
  }
}

export async function generateCommunityInviteLinkHandler(
  req: Request,
  res: Response
) {
  try {
    const adminUser = ensureAdmin(req);
    const expiresInHours =
      req.body?.expiresInHours === undefined
        ? undefined
        : Number(req.body.expiresInHours);

    const result = await generateCommunityOnboardingInviteLink(
      adminUser._id,
      req.params.interestId as string,
      {
        expiresInHours,
        frontendUrl: req.body?.frontendUrl,
        assignedRole: req.body?.assignedRole,
      }
    );

    return successResponse(res, {
      message: 'Community onboarding link generated successfully',
      ...result,
    });
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'COMMUNITY_INVITE_LINK_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'COMMUNITY_INVITE_LINK_FAILED',
      'Failed to generate community onboarding link'
    );
  }
}

export async function resolveCommunityInviteHandler(
  req: Request,
  res: Response
) {
  try {
    const token = String(req.query.token ?? '');
    const payload = await resolveCommunityInviteToken(token);

    return successResponse(res, {
      message: 'Community onboarding invite resolved',
      ...payload,
    });
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'COMMUNITY_INVITE_RESOLVE_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'COMMUNITY_INVITE_RESOLVE_FAILED',
      'Failed to resolve community onboarding invite'
    );
  }
}

export async function createCommunityAccountHandler(
  req: Request,
  res: Response
) {
  try {
    const payload = await createCommunityAccountFromInvite(req.body);
    return successResponse(
      res,
      {
        message: 'Community account created successfully',
        ...payload,
      },
      201
    );
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'COMMUNITY_ACCOUNT_CREATE_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'COMMUNITY_ACCOUNT_CREATE_FAILED',
      'Failed to create community account'
    );
  }
}

export async function verifyCommunityEmailOtpHandler(req: Request, res: Response) {
  try {
    const user = req.user as any;
    if (!user?._id) return errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    const { otp } = req.body as { otp?: string };
    if (!otp) return errorResponse(res, 400, 'VALIDATION_ERROR', 'otp is required');
    await verifyCommunityOtp(user._id as Types.ObjectId, otp);
    return successResponse(res, { message: 'Email verified successfully' });
  } catch (err) {
    if (err instanceof AppError) return errorResponse(res, err.statusCode, 'EMAIL_VERIFY_FAILED', err.message);
    return errorResponse(res, 500, 'EMAIL_VERIFY_FAILED', 'Failed to verify email');
  }
}

export async function saveCommunityOrganizationInformationHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await saveCommunityOrganizationInformation(user, req.body);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'COMMUNITY_ORGANIZATION_INFORMATION_SAVE_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'COMMUNITY_ORGANIZATION_INFORMATION_SAVE_FAILED',
      'Failed to save community organization information'
    );
  }
}

export async function getCommunityOrganizationInformationHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await getCommunityOrganizationInformation(user);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'COMMUNITY_ORGANIZATION_INFORMATION_FETCH_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'COMMUNITY_ORGANIZATION_INFORMATION_FETCH_FAILED',
      'Failed to fetch community organization information'
    );
  }
}

export async function saveCommunityStakeholderTypeHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await saveCommunityStakeholderType(user, req.body);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'COMMUNITY_STAKEHOLDER_TYPE_SAVE_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'COMMUNITY_STAKEHOLDER_TYPE_SAVE_FAILED',
      'Failed to save community stakeholder type'
    );
  }
}

export async function getCommunityStakeholderTypeHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await getCommunityStakeholderType(user);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'COMMUNITY_STAKEHOLDER_TYPE_FETCH_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'COMMUNITY_STAKEHOLDER_TYPE_FETCH_FAILED',
      'Failed to fetch community stakeholder type'
    );
  }
}

export async function getCommunityStakeholderDashboardProfileHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await getCommunityStakeholderDashboardProfile(user);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'COMMUNITY_STAKEHOLDER_PROFILE_FETCH_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'COMMUNITY_STAKEHOLDER_PROFILE_FETCH_FAILED',
      'Failed to fetch community stakeholder profile'
    );
  }
}

export async function saveCommunityProgramAssociationHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await saveCommunityProgramAssociation(user, req.body);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'COMMUNITY_PROGRAM_ASSOCIATION_SAVE_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'COMMUNITY_PROGRAM_ASSOCIATION_SAVE_FAILED',
      'Failed to save community program association'
    );
  }
}

export async function getCommunityProgramAssociationHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await getCommunityProgramAssociation(user);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'COMMUNITY_PROGRAM_ASSOCIATION_FETCH_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'COMMUNITY_PROGRAM_ASSOCIATION_FETCH_FAILED',
      'Failed to fetch community program association'
    );
  }
}

export async function saveCommunityDataVisibilityPrivacyHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await saveCommunityDataVisibilityPrivacy(user, req.body);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'COMMUNITY_DATA_VISIBILITY_PRIVACY_SAVE_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'COMMUNITY_DATA_VISIBILITY_PRIVACY_SAVE_FAILED',
      'Failed to save community data visibility and privacy step'
    );
  }
}

export async function getCommunityDataVisibilityPrivacyHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await getCommunityDataVisibilityPrivacy(user);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'COMMUNITY_DATA_VISIBILITY_PRIVACY_FETCH_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'COMMUNITY_DATA_VISIBILITY_PRIVACY_FETCH_FAILED',
      'Failed to fetch community data visibility and privacy step'
    );
  }
}

export async function saveCommunityImpactGoalsHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await saveCommunityImpactGoals(user, req.body);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'COMMUNITY_IMPACT_GOALS_SAVE_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'COMMUNITY_IMPACT_GOALS_SAVE_FAILED',
      'Failed to save community impact goals'
    );
  }
}

export async function getCommunityImpactGoalsHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await getCommunityImpactGoals(user);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'COMMUNITY_IMPACT_GOALS_FETCH_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'COMMUNITY_IMPACT_GOALS_FETCH_FAILED',
      'Failed to fetch community impact goals'
    );
  }
}

export async function saveCommunityReviewActivateHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await saveCommunityReviewActivate(user, req.body);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'COMMUNITY_REVIEW_ACTIVATE_SAVE_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'COMMUNITY_REVIEW_ACTIVATE_SAVE_FAILED',
      'Failed to activate community onboarding'
    );
  }
}

export async function getCommunityReviewActivateHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await getCommunityReviewActivate(user);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'COMMUNITY_REVIEW_ACTIVATE_FETCH_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'COMMUNITY_REVIEW_ACTIVATE_FETCH_FAILED',
      'Failed to fetch community review and activation payload'
    );
  }
}
