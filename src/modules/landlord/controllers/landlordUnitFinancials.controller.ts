import { Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import { UnitFinancialsModel } from '../../finances/models/unitFinancialsModel';
import { UnitModel } from '../../units/models/unit.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { resolveLandlordOrgId } from '../services/landlordDashboard.service';

const CreateUnitFinancialsSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM'),
  rentScheduled: z.number().min(0),
  rentCollected: z.number().min(0),
  maintenance: z.number().min(0).default(0),
  utilities: z.number().min(0).default(0),
  pmFeePct: z.number().min(0).max(100).default(0),
  taxesAlloc: z.number().min(0).default(0),
  insuranceAlloc: z.number().min(0).default(0),
  debtServiceAlloc: z.number().min(0).default(0),
});

export async function upsertUnitFinancialsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.auth?._id) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required'); return;
    }
    const { unitId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(unitId)) {
      errorResponse(res, 400, 'INVALID_ID', 'Invalid unit ID'); return;
    }

    const orgId = await resolveLandlordOrgId(req.auth._id as any);
    const orgOid = new mongoose.Types.ObjectId(orgId);

    // Verify unit belongs to this landlord's org
    const unit = await UnitModel.findById(unitId).lean();
    if (!unit) { errorResponse(res, 404, 'NOT_FOUND', 'Unit not found'); return; }

    const property = await PropertyModel.findOne({
      _id: (unit as any).propertyId,
      orgId: orgOid
    }).lean();
    if (!property) { errorResponse(res, 403, 'FORBIDDEN', 'Unit does not belong to your org'); return; }

    const body = CreateUnitFinancialsSchema.parse(req.body);
    const arrearsAmount = Math.max(0, body.rentScheduled - body.rentCollected);
    const paidStatus = arrearsAmount === 0 ? 'PAID' : body.rentCollected > 0 ? 'PARTIAL' : 'UNPAID';

    // Upsert — one record per unit per month
    const doc = await UnitFinancialsModel.findOneAndUpdate(
      { unitId: new mongoose.Types.ObjectId(unitId), month: body.month },
      {
        $set: {
          ...body,
          arrearsAmount,
          arrearsDays: arrearsAmount > 0 ? 30 : 0,
          paidStatus,
        }
      },
      { upsert: true, new: true }
    );

    successResponse(res, { id: (doc as any)._id.toString(), month: doc.month }, 201);
  } catch (err: any) {
    if (err instanceof AppError) { errorResponse(res, err.statusCode, 'FINANCIALS_ERROR', err.message); return; }
    if (err?.name === 'ZodError') { errorResponse(res, 400, 'VALIDATION_ERROR', 'Validation error', err.issues); return; }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to save unit financials');
  }
}
