import { Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { resolveLandlordOrgId } from '../services/landlordDashboard.service';
import { AppError } from '../../../core/errors/AppError';

const updatePropertySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: z.enum(['SFR', 'MF', 'BTR', 'Condo', 'Other']).optional(),
  address: z.object({
    line1: z.string().min(1).optional(),
    city: z.string().min(1).optional(),
    state: z.string().min(1).max(50).optional(),
    postalCode: z.string().min(5).optional(),
    country: z.string().optional()
  }).optional()
});

/**
 * PATCH /api/landlord/properties/:propertyId
 * Landlord updates their own property (name / type / address).
 */
export async function updateLandlordPropertyHandler(
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

    const parsed = updatePropertySchema.safeParse(req.body);
    if (!parsed.success) {
      errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
      return;
    }

    const orgId = await resolveLandlordOrgId(req.auth._id as any);
    const property = await PropertyModel.findOne({
      _id: new mongoose.Types.ObjectId(propertyId),
      orgId: new mongoose.Types.ObjectId(orgId)
    });

    if (!property) {
      errorResponse(res, 404, 'NOT_FOUND', 'Property not found');
      return;
    }

    const { name, type, address } = parsed.data;
    if (name !== undefined) property.name = name;
    if (type !== undefined) (property as any).type = type;
    if (address) {
      const addr = (property as any).address ?? {};
      (property as any).address = { ...addr, ...address };
    }

    await property.save();

    successResponse(res, {
      property: {
        id: property._id.toString(),
        name: property.name,
        type: (property as any).type,
        address: (property as any).address,
        imageUrl: (property as any).imageUrl ?? null
      }
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'UPDATE_FAILED', err.message);
      return;
    }
    errorResponse(res, 500, 'UPDATE_FAILED', 'Failed to update property');
  }
}

/**
 * DELETE /api/landlord/properties/:propertyId
 * Landlord deletes their own property (and its units/tenancies).
 */
export async function deleteLandlordPropertyHandler(
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

    const orgId = await resolveLandlordOrgId(req.auth._id as any);
    const property = await PropertyModel.findOne({
      _id: new mongoose.Types.ObjectId(propertyId),
      orgId: new mongoose.Types.ObjectId(orgId)
    }).lean();

    if (!property) {
      errorResponse(res, 404, 'NOT_FOUND', 'Property not found');
      return;
    }

    const units = await UnitModel.find({ propertyId: new mongoose.Types.ObjectId(propertyId) }).lean();
    const unitIds = units.map((u) => (u as any)._id);

    if (unitIds.length > 0) {
      const activeCount = await TenancyModel.countDocuments({
        unitId: { $in: unitIds },
        status: 'ACTIVE'
      });
      if (activeCount > 0) {
        errorResponse(res, 409, 'ACTIVE_TENANTS', 'Cannot delete a property with active tenants');
        return;
      }
      await TenancyModel.deleteMany({ unitId: { $in: unitIds } });
      await UnitModel.deleteMany({ propertyId: new mongoose.Types.ObjectId(propertyId) });
    }

    await PropertyModel.findByIdAndDelete(propertyId);

    successResponse(res, { deleted: true, propertyId });
  } catch (err: any) {
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'DELETE_FAILED', err.message);
      return;
    }
    errorResponse(res, 500, 'DELETE_FAILED', 'Failed to delete property');
  }
}
