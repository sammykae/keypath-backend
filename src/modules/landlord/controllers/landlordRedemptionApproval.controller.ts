import { Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import { RedemptionModel } from '../../rewards/models/redemption.model';
import { RewardCatalogModel } from '../../tenant/models/rewardCatalog.model';
import { fulfillRedemption } from '../../rewards/services/fulfillment.service';
import { resolveLandlordOrgId } from '../services/landlordDashboard.service';
import { writeAuditEvent } from '../../audit/services/audit.service';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';

const ReviewSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  rejectionReason: z.string().optional(),
});

async function getTenantIdsForOrg(orgId: string): Promise<mongoose.Types.ObjectId[]> {
  const orgOid = new mongoose.Types.ObjectId(orgId);
  const properties = await PropertyModel.find({ orgId: orgOid }).lean();
  if (!properties.length) return [];

  const propertyIds = properties.map((p: any) => p._id);
  const units = await UnitModel.find({ propertyId: { $in: propertyIds } }).lean();
  if (!units.length) return [];

  const unitIds = units.map((u: any) => u._id);
  const tenancies = await TenancyModel.find({ unitId: { $in: unitIds }, status: 'ACTIVE' }).lean();
  return tenancies.map((t: any) => t.tenantUserId);
}

/**
 * GET /api/landlord/rewards/redemptions/pending
 * List redemptions awaiting landlord approval for tenants in the landlord's org.
 */
export async function listPendingRedemptionsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.auth?._id as mongoose.Types.ObjectId;
    const orgId = await resolveLandlordOrgId(userId);
    const tenantIds = await getTenantIdsForOrg(orgId);

    const redemptions = await RedemptionModel.find({
      tenantUserId: { $in: tenantIds },
      approvalStatus: 'PENDING',
    })
      .populate('rewardId', 'title category costCredits rewardType')
      .populate('tenantUserId', 'fullName email')
      .sort({ createdAt: -1 })
      .lean();

    const items = redemptions.map((r: any) => ({
      redemptionId: r._id.toString(),
      tenant: r.tenantUserId
        ? { id: r.tenantUserId._id?.toString(), name: r.tenantUserId.fullName, email: r.tenantUserId.email }
        : null,
      reward: r.rewardId
        ? { id: r.rewardId._id?.toString(), title: r.rewardId.title, category: r.rewardId.category, costCredits: r.rewardId.costCredits }
        : null,
      amount: r.amount,
      approvalStatus: r.approvalStatus,
      createdAt: r.createdAt?.toISOString(),
    }));

    successResponse(res, { items });
  } catch (e: any) {
    if (e instanceof AppError) { errorResponse(res, e.statusCode, 'ERROR', e.message); return; }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to list pending redemptions');
  }
}

/**
 * PATCH /api/landlord/rewards/redemptions/:id/review
 * Approve or reject a pending redemption.
 * On APPROVE: triggers fulfillment (gift card code, rent credit, service request).
 */
export async function reviewRedemptionHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.auth?._id as mongoose.Types.ObjectId;
    const orgId = await resolveLandlordOrgId(userId);

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      errorResponse(res, 400, 'INVALID_ID', 'Invalid redemption id'); return;
    }

    const body = ReviewSchema.parse(req.body);
    const redemption = await RedemptionModel.findById(req.params.id);
    if (!redemption) { errorResponse(res, 404, 'NOT_FOUND', 'Redemption not found'); return; }

    if (redemption.approvalStatus !== 'PENDING') {
      errorResponse(res, 400, 'INVALID_STATE', `Cannot review redemption in status: ${redemption.approvalStatus}`); return;
    }

    // Verify the tenant belongs to the landlord's org
    const tenantIds = await getTenantIdsForOrg(orgId);
    const tenantBelongsToOrg = tenantIds.some(
      (id) => id.toString() === redemption.tenantUserId.toString()
    );
    if (!tenantBelongsToOrg) {
      errorResponse(res, 403, 'FORBIDDEN', 'Tenant does not belong to your organization'); return;
    }

    if (body.action === 'REJECT') {
      redemption.approvalStatus = 'REJECTED';
      redemption.rejectedBy = userId;
      redemption.rejectionReason = body.rejectionReason ?? null;
      await redemption.save();
      await writeAuditEvent({
        actorUserId: userId,
        orgId: new mongoose.Types.ObjectId(orgId),
        action: 'REDEMPTION_REJECTED',
        entityType: 'REDEMPTION',
        entityId: redemption._id as mongoose.Types.ObjectId,
        tenantId: redemption.tenantUserId as mongoose.Types.ObjectId,
        metadata: { rejectionReason: body.rejectionReason },
      });
      successResponse(res, { redemptionId: redemption._id.toString(), approvalStatus: 'REJECTED' });
      return;
    }

    // APPROVE — trigger fulfillment
    redemption.approvalStatus = 'APPROVED';
    redemption.approvedBy = userId;
    redemption.approvedAt = new Date();
    await redemption.save();

    const catalog: any = await RewardCatalogModel.findById(redemption.rewardId).lean();
    if (catalog) {
      await fulfillRedemption(
        redemption._id,
        { category: catalog.category, rewardId: catalog.rewardId, deliveryAmount: catalog.deliveryAmount },
        redemption.tenantUserId
      );
    }

    await writeAuditEvent({
      actorUserId: userId,
      orgId: new mongoose.Types.ObjectId(orgId),
      action: 'REDEMPTION_APPROVED',
      entityType: 'REDEMPTION',
      entityId: redemption._id as mongoose.Types.ObjectId,
      tenantId: redemption.tenantUserId as mongoose.Types.ObjectId,
    });

    const updated = await RedemptionModel.findById(redemption._id).lean();
    successResponse(res, {
      redemptionId: (updated as any)?._id?.toString(),
      approvalStatus: (updated as any)?.approvalStatus,
      fulfillment: (updated as any)?.fulfillment ?? null,
    });
  } catch (e: any) {
    if (e instanceof AppError) { errorResponse(res, e.statusCode, 'ERROR', e.message); return; }
    if (e.name === 'ZodError') { errorResponse(res, 400, 'VALIDATION_ERROR', 'Validation error', e.errors); return; }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to review redemption');
  }
}
