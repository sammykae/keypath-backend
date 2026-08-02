import crypto from 'crypto';
import { Response } from 'express';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { storage, S3Storage } from '../../docs/storage';
import { env } from '../../../core/config/env';
import { MaintenanceTicketModel } from '../models/maintenanceTicket.model';
import { resolveLandlordOrgId } from '../../landlord/services/landlordDashboard.service';

export async function maintenanceUploadHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file || !Buffer.isBuffer(file.buffer)) {
      errorResponse(res, 400, 'MISSING_FILE', 'Send multipart/form-data with field "file"');
      return;
    }

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80);
    const key = `maintenance/${req.auth._id.toString()}/${crypto.randomUUID()}_${safeName}`;

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

export async function maintenanceFileSignedUrlHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }

    const key = req.query.key as string | undefined;
    if (!key || !key.startsWith('maintenance/')) {
      errorResponse(res, 400, 'INVALID_KEY', 'Valid maintenance file key required');
      return;
    }

    // Previously any authenticated tenant/landlord could pass any other
    // tenant's/org's maintenance fileKey and receive a valid signed URL —
    // verify the requester actually owns (tenant) or manages (landlord) the
    // ticket this attachment belongs to.
    const role = req.auth.role?.toLowerCase();
    if (role !== 'admin') {
      const ticket = await MaintenanceTicketModel.findOne({ 'attachments.fileKey': key }).lean();
      if (!ticket) { errorResponse(res, 404, 'NOT_FOUND', 'File not found'); return; }

      if (role === 'tenant') {
        if ((ticket as any).tenantUserId.toString() !== req.auth._id.toString()) {
          errorResponse(res, 403, 'FORBIDDEN', 'You do not have access to this file');
          return;
        }
      } else if (role === 'landlord') {
        const orgId = await resolveLandlordOrgId(req.auth._id as any).catch(() => null);
        if (!orgId || (ticket as any).orgId.toString() !== orgId.toString()) {
          errorResponse(res, 403, 'FORBIDDEN', 'You do not have access to this file');
          return;
        }
      } else {
        errorResponse(res, 403, 'FORBIDDEN', 'You do not have access to this file');
        return;
      }
    }

    const bucket = process.env.AWS_S3_BUCKET;
    if (!bucket) {
      const backendUrl = env.BACKEND_URL.replace(/\/$/, '');
      successResponse(res, { url: `${backendUrl}/api/docs/files/${key}` });
      return;
    }

    const s3 = new S3Storage();
    const url = await s3.getSignedUrl(key, 3600);
    successResponse(res, { url });
  } catch {
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to get file URL');
  }
}
