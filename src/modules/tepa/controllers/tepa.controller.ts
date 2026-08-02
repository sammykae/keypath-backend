import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { TepaEnrollment } from '../models/tepa-enrollment.model';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { writeAuditEvent } from '../../audit/services/audit.service';
import { UnitModel } from '../../units/models/unit.model';

export const tepaOptIn = async (req: Request, res: Response) => {
  const user = req.user as any;
  const { unitId, consentVersion, acceptedAt } = req.body;

  // Codex: defensive auth guard even though route is behind passport jwt middleware.
  if (!user) {
    return errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
  }

  // Only tenants can opt in
  if (user.role !== 'TENANT') {
    return errorResponse(res, 403, 'FORBIDDEN', 'Tenant only endpoint');
  }

  // Codex: validate ObjectId again at controller boundary for safety in direct/internal calls.
  if (!Types.ObjectId.isValid(unitId)) {
    return errorResponse(res, 400, 'INVALID_UNIT_ID', 'unitId must be a valid ObjectId');
  }

  const acceptedAtDate = new Date(acceptedAt);
  if (Number.isNaN(acceptedAtDate.getTime())) {
    return errorResponse(res, 400, 'INVALID_ACCEPTED_AT', 'acceptedAt must be a valid ISO date');
  }

  const tenantUserId = user._id;
  const unitObjectId = new Types.ObjectId(unitId);

  // Check for existing ACTIVE enrollment
  const existing = await TepaEnrollment.findOne({
    tenantUserId,
    unitId: unitObjectId,
    status: 'ACTIVE',
  });

  if (existing) {
    return errorResponse(
      res,
      409,
      'TEPA_ALREADY_ACTIVE',
      'TEPA already active for this tenancy'
    );
  }

  let enrollment;
  try {
    enrollment = await TepaEnrollment.create({
      tenantUserId,
      unitId: unitObjectId,
      status: 'ACTIVE',
      effectiveDate: new Date(),
      consentVersion,
      acceptedAt: acceptedAtDate,
    });
  } catch (err: any) {
    // Codex: normalize unique-index race collisions into a business-level conflict response.
    if (err?.code === 11000) {
      return errorResponse(
        res,
        409,
        'TEPA_ALREADY_ACTIVE',
        'TEPA already active for this tenancy'
      );
    }
    throw err;
  }

  const unit = await UnitModel.findById(unitObjectId).select('propertyId').lean();

  await writeAuditEvent({
    actorUserId: tenantUserId,
    action: 'TEPA_OPT_IN',
    entityType: 'TepaEnrollment',
    entityId: enrollment._id,
    propertyId: unit?.propertyId,
    tenantId: tenantUserId,
    diff: {
      before: null,
      after: {
        unitId,
        consentVersion,
        acceptedAt: acceptedAtDate.toISOString(),
        status: 'ACTIVE',
      },
    },
  });

  return successResponse(res, enrollment, 201);
};
