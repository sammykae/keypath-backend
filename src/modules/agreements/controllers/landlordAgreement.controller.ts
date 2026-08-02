import { Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import { resolveLandlordOrgId } from '../../landlord/services/landlordDashboard.service';
import {
  listAgreementsForLandlord,
  uploadSignedAgreement,
  updateAgreementStatus,
  getAgreementFileForLandlord,
} from '../services/agreement.service';
import {
  UploadAgreementSchema,
  UpdateAgreementStatusSchema,
  ListAgreementsQuerySchema,
} from '../dto/agreement.dto';

function handleError(res: Response, err: unknown, fallback: string): void {
  if (err instanceof ZodError) {
    errorResponse(res, 400, 'VALIDATION_ERROR', err.issues[0]?.message ?? 'Validation error');
    return;
  }
  if (err instanceof AppError) {
    errorResponse(res, err.statusCode, 'APP_ERROR', err.message);
    return;
  }
  errorResponse(res, 500, 'INTERNAL_ERROR', fallback);
}

/** GET /api/landlord/agreements?propertyId=&unitId=&tenantUserId=&agreementType= */
export async function listAgreementsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const query = ListAgreementsQuerySchema.parse(req.query);
    const result = await listAgreementsForLandlord(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      query as any
    );
    successResponse(res, { agreements: result });
  } catch (err) {
    handleError(res, err, 'Failed to list agreements');
  }
}

/** POST /api/landlord/agreements/upload-signed — create/update an agreement with a previously-uploaded document. */
export async function uploadSignedAgreementHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const body = UploadAgreementSchema.parse(req.body);
    const document = req.body.document;
    if (!document?.fileKey || !document?.fileName || !document?.fileType) {
      errorResponse(res, 400, 'VALIDATION_ERROR', 'document { fileKey, fileName, fileType } is required — upload the file first via POST /agreements/upload');
      return;
    }
    const userId = new mongoose.Types.ObjectId(req.auth._id.toString());
    const orgId = await resolveLandlordOrgId(userId);
    const result = await uploadSignedAgreement(userId, orgId, { ...body, document } as any);
    successResponse(res, result, 201);
  } catch (err) {
    handleError(res, err, 'Failed to upload agreement');
  }
}

/** PATCH /api/landlord/agreements/:agreementId/status */
export async function updateAgreementStatusHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const body = UpdateAgreementStatusSchema.parse(req.body);
    const userId = new mongoose.Types.ObjectId(req.auth._id.toString());
    const orgId = await resolveLandlordOrgId(userId);
    const result = await updateAgreementStatus(userId, orgId, req.params.agreementId, body);
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to update agreement status');
  }
}

/** GET /api/landlord/agreements/:agreementId/file */
export async function getAgreementFileHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const result = await getAgreementFileForLandlord(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      req.params.agreementId
    );
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to load document');
  }
}
