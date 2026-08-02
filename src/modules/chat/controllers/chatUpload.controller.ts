import crypto from 'crypto';
import { Response } from 'express';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { storage, S3Storage } from '../../docs/storage';
import { logger } from '../../../core/logger';
import { env } from '../../../core/config/env';

export async function chatFileSignedUrlHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const key = req.query.key as string | undefined;
    if (!key || !key.startsWith('chat/')) {
      errorResponse(res, 400, 'INVALID_KEY', 'Valid chat file key required');
      return;
    }

    const bucket = process.env.AWS_S3_BUCKET;

    if (!bucket) {
      const backendUrl = env.BACKEND_URL.replace(/\/$/, '');
      successResponse(res, { url: `${backendUrl}/api/docs/files/${key}` });
      return;
    }

    const s3 = new S3Storage();
    const url = await s3.getSignedUrl(key, 604800);
    successResponse(res, { url });
  } catch (e) {
    logger.error({ err: e }, 'chatFilePublicUrl failed');
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to resolve file URL');
  }
}

export async function chatUploadHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file || !Buffer.isBuffer(file.buffer)) {
      errorResponse(res, 400, 'MISSING_FILE', 'Send multipart/form-data with field "file"');
      return;
    }

    const ext = file.originalname.split('.').pop() ?? '';
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80);
    const key = `chat/${req.auth._id.toString()}/${crypto.randomUUID()}_${safeName}`;

    const { fileKey } = await storage.put(key, file.buffer, file.mimetype);

    const backendUrl = env.BACKEND_URL.replace(/\/$/, '');
    const proxyUrl = `${backendUrl}/api/docs/files/${fileKey}`;

    successResponse(res, {
      fileKey,
      publicUrl: proxyUrl,
      fileName: file.originalname,
      fileType: file.mimetype,
      fileSize: file.size,
      ext
    }, 201);
  } catch (e) {
    logger.error({ err: e }, 'chatUpload failed');
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to upload file');
  }
}
