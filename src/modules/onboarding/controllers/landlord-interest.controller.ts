import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { errorResponse, successResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import {
  createLandlordInterest,
  generateLandlordOnboardingInviteLink,
  listLandlordInterests,
  resolveLandlordInviteToken,
} from '../services/landlord-interest.service';
import {
  createLandlordAccountFromInvite,
  verifyLandlordOtp,
  getLandlordComplianceAcknowledgements,
  getLandlordComplianceDocuments,
  getLandlordFrameworkAcknowledgement,
  getLandlordProgramEconomicsRules,
  getLandlordProgramSelection,
  getLandlordPropertyDetails,
  getLandlordReviewActivate,
  saveLandlordComplianceAcknowledgements,
  saveLandlordComplianceDocuments,
  saveLandlordFrameworkAcknowledgement,
  saveLandlordProgramEconomicsRules,
  saveLandlordProgramSelection,
  saveLandlordPropertyDetails,
  saveLandlordReviewActivate,
} from '../services/landlord-onboarding.service';

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

export async function submitLandlordInterestHandler(req: Request, res: Response) {
  try {
    const result = await createLandlordInterest(req.body);
    return successResponse(
      res,
      {
        message: 'Landlord interest submitted successfully',
        interestId: result.interestId,
        status: result.status,
      },
      201
    );
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(res, err.statusCode, 'LANDLORD_INTEREST_SUBMIT_FAILED', err.message);
    }

    return errorResponse(res, 500, 'LANDLORD_INTEREST_SUBMIT_FAILED', 'Failed to submit landlord interest');
  }
}

export async function listLandlordInterestHandler(req: Request, res: Response) {
  try {
    ensureAdmin(req);
    const status = req.query.status as 'SUBMITTED' | 'INVITE_GENERATED' | 'ONBOARDED' | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const items = await listLandlordInterests({ status, limit });
    return successResponse(res, { items });
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(res, err.statusCode, 'LANDLORD_INTEREST_LIST_FAILED', err.message);
    }

    return errorResponse(res, 500, 'LANDLORD_INTEREST_LIST_FAILED', 'Failed to fetch landlord interests');
  }
}

export async function generateLandlordInviteLinkHandler(req: Request, res: Response) {
  try {
    const adminUser = ensureAdmin(req);
    const expiresInHours =
      req.body?.expiresInHours === undefined
        ? undefined
        : Number(req.body.expiresInHours);

    const result = await generateLandlordOnboardingInviteLink(
      adminUser._id,
      req.params.interestId as string,
      {
        expiresInHours,
        frontendUrl: req.body?.frontendUrl,
      }
    );

    return successResponse(res, {
      message: 'Landlord onboarding link generated successfully',
      ...result,
    });
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(res, err.statusCode, 'LANDLORD_INVITE_LINK_FAILED', err.message);
    }

    return errorResponse(res, 500, 'LANDLORD_INVITE_LINK_FAILED', 'Failed to generate onboarding link');
  }
}

export async function resolveLandlordInviteHandler(req: Request, res: Response) {
  try {
    const token = String(req.query.token ?? '');
    const payload = await resolveLandlordInviteToken(token);

    return successResponse(res, {
      message: 'Landlord onboarding invite resolved',
      ...payload,
    });
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(res, err.statusCode, 'LANDLORD_INVITE_RESOLVE_FAILED', err.message);
    }

    return errorResponse(res, 500, 'LANDLORD_INVITE_RESOLVE_FAILED', 'Failed to resolve onboarding invite');
  }
}

export async function createLandlordAccountHandler(req: Request, res: Response) {
  try {
    const payload = await createLandlordAccountFromInvite(req.body);
    return successResponse(
      res,
      {
        message: 'Landlord account created successfully',
        ...payload,
      },
      201
    );
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(res, err.statusCode, 'LANDLORD_ACCOUNT_CREATE_FAILED', err.message);
    }

    return errorResponse(res, 500, 'LANDLORD_ACCOUNT_CREATE_FAILED', 'Failed to create landlord account');
  }
}

export async function verifyLandlordEmailOtpHandler(req: Request, res: Response) {
  try {
    const user = req.user as any;
    if (!user?._id) {
      return errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    }
    const { otp } = req.body as { otp?: string };
    if (!otp) {
      return errorResponse(res, 400, 'VALIDATION_ERROR', 'otp is required');
    }
    await verifyLandlordOtp(user._id as Types.ObjectId, otp);
    return successResponse(res, { message: 'Email verified successfully' });
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(res, err.statusCode, 'EMAIL_VERIFY_FAILED', err.message);
    }
    return errorResponse(res, 500, 'EMAIL_VERIFY_FAILED', 'Failed to verify email');
  }
}

export async function saveLandlordPropertyDetailsHandler(req: Request, res: Response) {
  try {
    const user = req.user as any;
    const payload = await saveLandlordPropertyDetails(user, req.body);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(res, err.statusCode, 'LANDLORD_PROPERTY_DETAILS_SAVE_FAILED', err.message);
    }

    return errorResponse(
      res,
      500,
      'LANDLORD_PROPERTY_DETAILS_SAVE_FAILED',
      'Failed to save landlord property details'
    );
  }
}

export async function getLandlordPropertyDetailsHandler(req: Request, res: Response) {
  try {
    const user = req.user as any;
    const payload = await getLandlordPropertyDetails(user);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(res, err.statusCode, 'LANDLORD_PROPERTY_DETAILS_FETCH_FAILED', err.message);
    }

    return errorResponse(
      res,
      500,
      'LANDLORD_PROPERTY_DETAILS_FETCH_FAILED',
      'Failed to fetch landlord property details'
    );
  }
}

export async function saveLandlordProgramSelectionHandler(req: Request, res: Response) {
  try {
    const user = req.user as any;
    const payload = await saveLandlordProgramSelection(user, req.body);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(res, err.statusCode, 'LANDLORD_PROGRAM_SELECTION_SAVE_FAILED', err.message);
    }

    return errorResponse(
      res,
      500,
      'LANDLORD_PROGRAM_SELECTION_SAVE_FAILED',
      'Failed to save landlord program selection'
    );
  }
}

export async function getLandlordProgramSelectionHandler(req: Request, res: Response) {
  try {
    const user = req.user as any;
    const payload = await getLandlordProgramSelection(user);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(res, err.statusCode, 'LANDLORD_PROGRAM_SELECTION_FETCH_FAILED', err.message);
    }

    return errorResponse(
      res,
      500,
      'LANDLORD_PROGRAM_SELECTION_FETCH_FAILED',
      'Failed to fetch landlord program selection'
    );
  }
}

export async function saveLandlordComplianceDocumentsHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await saveLandlordComplianceDocuments(user, req.body);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'LANDLORD_COMPLIANCE_DOCUMENTS_SAVE_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'LANDLORD_COMPLIANCE_DOCUMENTS_SAVE_FAILED',
      'Failed to save landlord compliance documents'
    );
  }
}

export async function getLandlordComplianceDocumentsHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await getLandlordComplianceDocuments(user);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'LANDLORD_COMPLIANCE_DOCUMENTS_FETCH_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'LANDLORD_COMPLIANCE_DOCUMENTS_FETCH_FAILED',
      'Failed to fetch landlord compliance documents'
    );
  }
}

export async function saveLandlordProgramEconomicsRulesHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await saveLandlordProgramEconomicsRules(user, req.body);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'LANDLORD_PROGRAM_ECONOMICS_RULES_SAVE_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'LANDLORD_PROGRAM_ECONOMICS_RULES_SAVE_FAILED',
      'Failed to save landlord program economics rules'
    );
  }
}

export async function getLandlordProgramEconomicsRulesHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await getLandlordProgramEconomicsRules(user);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'LANDLORD_PROGRAM_ECONOMICS_RULES_FETCH_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'LANDLORD_PROGRAM_ECONOMICS_RULES_FETCH_FAILED',
      'Failed to fetch landlord program economics rules'
    );
  }
}

export async function saveLandlordFrameworkAcknowledgementHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await saveLandlordFrameworkAcknowledgement(user, req.body);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'LANDLORD_FRAMEWORK_ACKNOWLEDGEMENT_SAVE_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'LANDLORD_FRAMEWORK_ACKNOWLEDGEMENT_SAVE_FAILED',
      'Failed to save landlord framework acknowledgement'
    );
  }
}

export async function getLandlordFrameworkAcknowledgementHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await getLandlordFrameworkAcknowledgement(user);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'LANDLORD_FRAMEWORK_ACKNOWLEDGEMENT_FETCH_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'LANDLORD_FRAMEWORK_ACKNOWLEDGEMENT_FETCH_FAILED',
      'Failed to fetch landlord framework acknowledgement'
    );
  }
}

export async function saveLandlordComplianceAcknowledgementsHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await saveLandlordComplianceAcknowledgements(user, req.body);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'LANDLORD_COMPLIANCE_ACKNOWLEDGEMENTS_SAVE_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'LANDLORD_COMPLIANCE_ACKNOWLEDGEMENTS_SAVE_FAILED',
      'Failed to save landlord compliance acknowledgements'
    );
  }
}

export async function getLandlordComplianceAcknowledgementsHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await getLandlordComplianceAcknowledgements(user);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'LANDLORD_COMPLIANCE_ACKNOWLEDGEMENTS_FETCH_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'LANDLORD_COMPLIANCE_ACKNOWLEDGEMENTS_FETCH_FAILED',
      'Failed to fetch landlord compliance acknowledgements'
    );
  }
}

export async function getLandlordReviewActivateHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await getLandlordReviewActivate(user);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'LANDLORD_REVIEW_ACTIVATE_FETCH_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'LANDLORD_REVIEW_ACTIVATE_FETCH_FAILED',
      'Failed to fetch landlord review and activation data'
    );
  }
}

export async function saveLandlordReviewActivateHandler(
  req: Request,
  res: Response
) {
  try {
    const user = req.user as any;
    const payload = await saveLandlordReviewActivate(user, req.body);
    return successResponse(res, payload);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(
        res,
        err.statusCode,
        'LANDLORD_REVIEW_ACTIVATE_SAVE_FAILED',
        err.message
      );
    }

    return errorResponse(
      res,
      500,
      'LANDLORD_REVIEW_ACTIVATE_SAVE_FAILED',
      'Failed to activate landlord onboarding program'
    );
  }
}
