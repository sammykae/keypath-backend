import { Response } from 'express';
import mongoose from 'mongoose';
import { z, ZodError } from 'zod';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import { resolveLandlordOrgId } from '../services/landlordDashboard.service';
import { Organization } from '../../orgs/models/organization.model';
import { AuditEvent } from '../../audit/models/audit-log.model';

const UpdateChatSettingsSchema = z.object({
  allowDirectTenantMessaging: z.boolean(),
});

export async function getChatSettingsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const orgId = await resolveLandlordOrgId(req.auth._id as mongoose.Types.ObjectId);
    const org = await Organization.findById(orgId).lean();
    if (!org) { errorResponse(res, 404, 'NOT_FOUND', 'Organization not found'); return; }
    successResponse(res, {
      allowDirectTenantMessaging: org.settings?.allowDirectTenantMessaging ?? true,
    });
  } catch (err: any) {
    if (err instanceof AppError) { errorResponse(res, err.statusCode, 'APP_ERROR', err.message); return; }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to fetch chat settings');
  }
}

export async function updateChatSettingsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const body = UpdateChatSettingsSchema.parse(req.body);
    const orgId = await resolveLandlordOrgId(req.auth._id as mongoose.Types.ObjectId);
    const org = await Organization.findById(orgId);
    if (!org) { errorResponse(res, 404, 'NOT_FOUND', 'Organization not found'); return; }

    const oldValue = org.settings?.allowDirectTenantMessaging ?? true;
    org.settings = { ...(org.settings ?? { allowDirectTenantMessaging: true }), allowDirectTenantMessaging: body.allowDirectTenantMessaging };
    await org.save();

    AuditEvent.create({
      actorUserId: req.auth._id,
      orgId: org._id,
      action: 'CHAT_SETTINGS_CHANGED',
      entityType: 'organization',
      entityId: org._id,
      source: 'user',
      updateType: 'manual',
      diff: {
        before: { allowDirectTenantMessaging: oldValue },
        after: { allowDirectTenantMessaging: body.allowDirectTenantMessaging },
      },
    }).catch(() => {});

    successResponse(res, {
      allowDirectTenantMessaging: body.allowDirectTenantMessaging,
    });
  } catch (err: any) {
    if (err instanceof ZodError) { errorResponse(res, 400, 'VALIDATION_ERROR', err.issues[0]?.message ?? 'Validation error'); return; }
    if (err instanceof AppError) { errorResponse(res, err.statusCode, 'APP_ERROR', err.message); return; }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to update chat settings');
  }
}
