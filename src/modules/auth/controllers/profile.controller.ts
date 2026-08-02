import { Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { AuthenticatedRequest } from '../types/auth-request';
import { User } from '../models/user.model';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { writeAuditEvent } from '../../audit/services/audit.service';
import { Types } from 'mongoose';
import { storage } from '../../docs/storage';

// updateProfile only touches shared display fields — role-specific fields use POST /me/setup
const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
});

export const getProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.auth) {
    errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return;
  }

  const user = await User.findById(req.auth._id).select('-passwordHash -oauthProviders').lean();
  if (!user) {
    errorResponse(res, 404, 'USER_NOT_FOUND', 'User not found');
    return;
  }

  successResponse(res, {
    id: user._id,
    email: user.email,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified ?? false,
    profile: user.profile ?? {},
    tenantProfile: user.tenantProfile ?? null,
    landlordProfile: user.landlordProfile ?? null,
    communityProfile: user.communityProfile ?? null,
    investorProfile: user.investorProfile ?? null,
  });
};

export const updateProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.auth) {
    errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return;
  }

  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
    return;
  }

  const { firstName, lastName } = parsed.data;

  const update: Record<string, any> = {};
  if (firstName !== undefined) update['profile.firstName'] = firstName;
  if (lastName !== undefined) update['profile.lastName'] = lastName;

  const user = await User.findByIdAndUpdate(
    req.auth._id,
    { $set: update },
    { new: true, select: '-passwordHash -oauthProviders' }
  ).lean();

  if (!user) {
    errorResponse(res, 404, 'USER_NOT_FOUND', 'User not found');
    return;
  }

  await writeAuditEvent({
    actorUserId: req.auth._id as Types.ObjectId,
    action: 'PROFILE_UPDATED',
    entityType: 'User',
    entityId: req.auth._id as Types.ObjectId,
    diff: { before: null, after: parsed.data },
  });

  successResponse(res, {
    id: user._id,
    email: user.email,
    role: user.role,
    status: user.status,
    profile: user.profile ?? {},
    tenantProfile: user.tenantProfile ?? null,
    landlordProfile: user.landlordProfile ?? null,
    communityProfile: user.communityProfile ?? null,
    investorProfile: user.investorProfile ?? null,
  });
};

export const uploadAvatar = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.auth) {
    errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return;
  }

  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file || !Buffer.isBuffer(file.buffer)) {
    errorResponse(res, 400, 'MISSING_FILE', 'Send multipart/form-data with field "avatar"');
    return;
  }

  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowed.includes(file.mimetype)) {
    errorResponse(res, 400, 'INVALID_FILE_TYPE', 'Only JPEG, PNG, WebP and GIF allowed');
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    errorResponse(res, 400, 'FILE_TOO_LARGE', 'Avatar must be under 5MB');
    return;
  }

  const ext = file.originalname.split('.').pop() ?? 'jpg';
  const key = `avatars/${req.auth._id.toString()}/${crypto.randomUUID()}.${ext}`;
  const { publicUrl } = await storage.put(key, file.buffer, file.mimetype);

  await User.findByIdAndUpdate(req.auth._id, {
    $set: { 'profile.avatarUrl': publicUrl },
  });

  await writeAuditEvent({
    actorUserId: req.auth._id as Types.ObjectId,
    action: 'PROFILE_UPDATED',
    entityType: 'User',
    entityId: req.auth._id as Types.ObjectId,
    diff: { before: null, after: { avatarUrl: publicUrl } },
  });

  successResponse(res, { avatarUrl: publicUrl });
};
