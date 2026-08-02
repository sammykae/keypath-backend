import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { queryAuditActivityByProperty } from '../services/auditActivityQuery.service';
import { auditActivityQuerySchema } from '../validators/auditActivity.validators';
import { PropertyModel } from '../../properties/models/propertyModel';
import { resolveOrgIdForUser } from '../../chat/services/participantRules.service';

export const listAuditActivityByPropertyHandler = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.auth?._id) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }

    const parsed = auditActivityQuerySchema.safeParse({ query: req.query });
    if (!parsed.success) {
      errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid query', parsed.error.flatten());
      return;
    }

    const q = parsed.data.query;
    if (!mongoose.Types.ObjectId.isValid(q.propertyId)) {
      errorResponse(res, 400, 'INVALID_PROPERTY_ID', 'propertyId must be a valid ObjectId');
      return;
    }
    if (q.actorUserId && !mongoose.Types.ObjectId.isValid(q.actorUserId)) {
      errorResponse(res, 400, 'INVALID_ACTOR_USER_ID', 'actorUserId must be a valid ObjectId');
      return;
    }
    if (q.tenantId && !mongoose.Types.ObjectId.isValid(q.tenantId)) {
      errorResponse(res, 400, 'INVALID_TENANT_ID', 'tenantId must be a valid ObjectId');
      return;
    }
    if (q.from && Number.isNaN(new Date(q.from).getTime())) {
      errorResponse(res, 400, 'INVALID_FROM', 'from must be a valid ISO date string');
      return;
    }
    if (q.to && Number.isNaN(new Date(q.to).getTime())) {
      errorResponse(res, 400, 'INVALID_TO', 'to must be a valid ISO date string');
      return;
    }

    const userId = req.auth._id.toString();
    const orgIdFromJwt = req.auth.orgId;
    const orgId =
      orgIdFromJwt && mongoose.Types.ObjectId.isValid(orgIdFromJwt)
        ? orgIdFromJwt
        : await resolveOrgIdForUser(userId);

    if (!orgId) {
      errorResponse(res, 400, 'ORG_REQUIRED', 'User must belong to an organization');
      return;
    }

    const property = await PropertyModel.findOne({
      _id: new mongoose.Types.ObjectId(q.propertyId),
      orgId: new mongoose.Types.ObjectId(orgId),
    }).lean();

    if (!property) {
      errorResponse(res, 404, 'NOT_FOUND', 'Property not found or access denied');
      return;
    }

    const result = await queryAuditActivityByProperty({
      propertyId: q.propertyId,
      entityType: q.entityType,
      action: q.action,
      actorUserId: q.actorUserId,
      tenantId: q.tenantId,
      from: q.from,
      to: q.to,
      limit: q.limit,
      skip: q.skip,
    });

    successResponse(res, result);
  } catch {
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to list activity logs');
  }
};
