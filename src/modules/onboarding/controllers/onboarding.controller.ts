import { Response } from 'express';
import {
  evaluateOnboarding,
  submitOnboardingStep,
  uploadOnboardingDocument,
  verifyOnboardingDocument,
} from '../services/onboarding.service';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { storage } from '../../docs/storage';
import crypto from 'crypto';

export const getOnboardingStatus = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  if (!req.auth) {
    return errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
  }

  const status = await evaluateOnboarding(req.auth);

  return successResponse(res, status);
};

export const submitOnboardingStepHandler = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  if (!req.auth) {
    return errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
  }

  const result = await submitOnboardingStep(req.auth, req.body);
  if (!result.ok) {
    return errorResponse(res, result.status, result.code, result.message);
  }

  return successResponse(res, result.data);
};

export const uploadOnboardingDocumentHandler = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  if (!req.auth) {
    return errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
  }

  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file || !Buffer.isBuffer(file.buffer)) {
    return errorResponse(
      res,
      400,
      'MISSING_FILE',
      'Send file as multipart form with field "file"'
    );
  }

  const { stepKey, documentType } = req.body as {
    stepKey?: string;
    documentType?: string;
  };

  if (!stepKey || !documentType) {
    return errorResponse(
      res,
      400,
      'VALIDATION_ERROR',
      'stepKey and documentType are required'
    );
  }

  const userId = String(req.auth._id);
  const key = `onboarding/${userId}/${crypto.randomUUID()}_${file.originalname.replace(/\s+/g, '-')}`;
  const { publicUrl } = await storage.put(key, file.buffer, file.mimetype);

  const result = await uploadOnboardingDocument(req.auth, {
    stepKey,
    documentType,
    fileName: file.originalname,
    fileUrl: publicUrl,
  });
  if (!result.ok) {
    return errorResponse(res, result.status, result.code, result.message);
  }

  return successResponse(res, result.data, 201);
};

export const verifyOnboardingDocumentHandler = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  if (!req.auth) {
    return errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
  }

  const result = await verifyOnboardingDocument(req.auth, req.body);
  if (!result.ok) {
    return errorResponse(res, result.status, result.code, result.message);
  }

  return successResponse(res, result.data);
};
