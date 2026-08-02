import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { errorResponse, successResponse } from '../../../core/utils/response';
import { LandlordInterestModel } from '../models/landlord-interest.model';
import { CommunityInterestModel } from '../models/community-interest.model';
import { InvestorInterestModel } from '../models/investor-interest.model';
import { TenantInterestModel } from '../models/tenant-interest.model';
import { writeAuditEvent } from '../../audit/services/audit.service';

type InterestType = 'landlord' | 'community' | 'investor' | 'tenant';

const MODEL_MAP = {
  landlord: LandlordInterestModel,
  community: CommunityInterestModel,
  investor: InvestorInterestModel,
  tenant: TenantInterestModel,
};

function ensureAdmin(req: Request): { _id: Types.ObjectId; role: string } {
  const user = req.user as any;
  if (!user) throw new AppError('Authentication required', 401);
  if (user.role !== 'ADMIN') throw new AppError('Admin only endpoint', 403);
  return user;
}

export async function rejectInterestHandler(req: Request, res: Response) {
  try {
    const adminUser = ensureAdmin(req);
    const interestType = req.params.type as InterestType;
    const { interestId } = req.params;
    const rejectionReason: string | undefined = req.body?.rejectionReason?.trim() || undefined;

    const Model = MODEL_MAP[interestType];
    if (!Model) {
      return errorResponse(res, 400, 'INVALID_TYPE', `Unknown interest type: ${interestType}`);
    }

    const doc = await (Model as any).findById(interestId);
    if (!doc) {
      return errorResponse(res, 404, 'NOT_FOUND', 'Interest request not found');
    }
    if (doc.status === 'ONBOARDED') {
      return errorResponse(res, 409, 'ALREADY_ONBOARDED', 'Cannot reject a completed onboarding');
    }

    doc.status = 'REJECTED' as any;
    if (rejectionReason) (doc as any).rejectionReason = rejectionReason;
    await doc.save();

    await writeAuditEvent({
      actorUserId: adminUser._id as Types.ObjectId,
      action: `${interestType.toUpperCase()}_INTEREST_REJECTED`,
      entityType: `${interestType.charAt(0).toUpperCase() + interestType.slice(1)}Interest`,
      entityId: doc._id as Types.ObjectId,
      diff: { before: null, after: { status: 'REJECTED', rejectionReason: rejectionReason ?? null } },
    });

    return successResponse(res, {
      id: String(doc._id),
      status: 'REJECTED',
      rejectionReason: rejectionReason ?? null,
    });
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(res, err.statusCode, 'REJECT_INTEREST_FAILED', err.message);
    }
    return errorResponse(res, 500, 'REJECT_INTEREST_FAILED', 'Failed to reject interest request');
  }
}
