import crypto from 'crypto';
import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { PropertyModel } from '../../properties/models/propertyModel';
import { storage } from '../../docs/storage';
import { resolveLandlordOrgId } from '../services/landlordDashboard.service';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * POST /api/landlord/properties/:propertyId/image
 * Uploads a cover image for a property and saves the S3 URL.
 */
export async function uploadPropertyImageHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.auth?._id) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }

    const { propertyId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(propertyId)) {
      errorResponse(res, 400, 'INVALID_ID', 'Invalid propertyId');
      return;
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file || !Buffer.isBuffer(file.buffer)) {
      errorResponse(res, 400, 'MISSING_FILE', 'Send multipart/form-data with field "image"');
      return;
    }

    if (!ALLOWED_MIME.includes(file.mimetype)) {
      errorResponse(res, 400, 'INVALID_FILE_TYPE', 'Only JPEG, PNG, WebP and GIF are allowed');
      return;
    }

    const orgId = await resolveLandlordOrgId(req.auth._id as any, req.auth.orgId as any);
    const property = await PropertyModel.findOne({
      _id: new mongoose.Types.ObjectId(propertyId),
      orgId: new mongoose.Types.ObjectId(orgId)
    }).lean();

    if (!property) {
      errorResponse(res, 404, 'NOT_FOUND', 'Property not found');
      return;
    }

    const ext = file.originalname.split('.').pop() ?? 'jpg';
    const key = `properties/${propertyId}/${crypto.randomUUID()}.${ext}`;
    const { publicUrl } = await storage.put(key, file.buffer, file.mimetype);

    await PropertyModel.findByIdAndUpdate(propertyId, { $set: { imageUrl: publicUrl } });

    successResponse(res, { imageUrl: publicUrl });
  } catch (err: any) {
    errorResponse(res, 500, 'UPLOAD_FAILED', err.message ?? 'Failed to upload image');
  }
}
