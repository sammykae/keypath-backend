import crypto from 'crypto';
import { Response } from 'express';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { storage } from '../../docs/storage';

/** POST /api/landlord/compliance-documents/upload — multipart file upload, returns fileKey to reference in the attach call. */
export async function complianceUploadHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file || !Buffer.isBuffer(file.buffer)) {
      errorResponse(res, 400, 'MISSING_FILE', 'Send multipart/form-data with field "file"');
      return;
    }

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80);
    const key = `compliance/${req.auth._id.toString()}/${crypto.randomUUID()}_${safeName}`;

    const { fileKey } = await storage.put(key, file.buffer, file.mimetype);

    successResponse(res, {
      fileKey,
      fileName: file.originalname,
      fileType: file.mimetype,
    }, 201);
  } catch {
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to upload file');
  }
}
