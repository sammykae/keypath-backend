import { Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import { resolveLandlordOrgId } from '../../landlord/services/landlordDashboard.service';
import {
  listComplianceForLandlord,
  uploadComplianceDocument,
  updateComplianceStatus,
  getComplianceAggregation,
  getComplianceDocumentFile,
} from '../services/complianceDocument.service';
import {
  UploadComplianceDocumentSchema,
  UpdateComplianceStatusSchema,
  ListComplianceQuerySchema,
} from '../dto/complianceDocument.dto';

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

/** GET /api/landlord/compliance-documents?propertyId=&status=&documentType= */
export async function listComplianceDocumentsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const query = ListComplianceQuerySchema.parse(req.query);
    const result = await listComplianceForLandlord(new mongoose.Types.ObjectId(req.auth._id.toString()), query as any);
    successResponse(res, { documents: result });
  } catch (err) {
    handleError(res, err, 'Failed to list compliance documents');
  }
}

/** GET /api/landlord/compliance-documents/summary?propertyId= */
export async function getComplianceSummaryHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const propertyId = typeof req.query.propertyId === 'string' ? req.query.propertyId : undefined;
    const result = await getComplianceAggregation(new mongoose.Types.ObjectId(req.auth._id.toString()), propertyId);
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to load compliance summary');
  }
}

/** POST /api/landlord/compliance-documents/upload-complete */
export async function uploadComplianceDocumentHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const body = UploadComplianceDocumentSchema.parse(req.body);
    const userId = new mongoose.Types.ObjectId(req.auth._id.toString());
    const orgId = await resolveLandlordOrgId(userId);
    const result = await uploadComplianceDocument(userId, orgId, body);
    successResponse(res, result, 201);
  } catch (err) {
    handleError(res, err, 'Failed to upload compliance document');
  }
}

/** PATCH /api/landlord/compliance-documents/:id/status */
export async function updateComplianceStatusHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const body = UpdateComplianceStatusSchema.parse(req.body);
    const userId = new mongoose.Types.ObjectId(req.auth._id.toString());
    const orgId = await resolveLandlordOrgId(userId);
    const result = await updateComplianceStatus(userId, orgId, req.params.id, body);
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to update compliance status');
  }
}

/** GET /api/landlord/compliance-documents/:id/file */
export async function getComplianceDocumentFileHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const result = await getComplianceDocumentFile(new mongoose.Types.ObjectId(req.auth._id.toString()), req.params.id);
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to load document');
  }
}
