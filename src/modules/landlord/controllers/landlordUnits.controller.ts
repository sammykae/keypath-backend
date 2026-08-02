import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import { UnitModel } from '../../units/models/unit.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { resolveLandlordOrgId } from '../services/landlordDashboard.service';

export async function listPropertyUnitsHandler(
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

    const activeTenancies = await TenancyModel.find({
      unitId: { $in: unitIds },
      status: 'ACTIVE'
    }).lean();

    const tenancyByUnit = new Map<string, any>();
    for (const t of activeTenancies) {
      tenancyByUnit.set((t as any).unitId.toString(), t);
    }

    const User = mongoose.model('User');
    const tenantUserIds = activeTenancies.map((t) => (t as any).tenantUserId);
    const tenantUsers = await User.find({ _id: { $in: tenantUserIds } }).lean();
    const userMap = new Map(tenantUsers.map((u: any) => [u._id.toString(), u]));

    const result = units.map((u) => {
      const uid = (u as any)._id.toString();
      const tenancy = tenancyByUnit.get(uid);
      let tenant = null;
      if (tenancy) {
        const tenantUser = userMap.get((tenancy as any).tenantUserId.toString()) as any;
        const firstName = tenantUser?.profile?.firstName?.trim() ?? '';
        const lastName = tenantUser?.profile?.lastName?.trim() ?? '';
        const email = tenantUser?.email ?? '';
        const name = (firstName || lastName)
          ? `${firstName} ${lastName}`.trim()
          : email.split('@')[0] || 'Tenant';
        tenant = {
          tenantUserId: (tenancy as any).tenantUserId.toString(),
          name,
          email,
          rentAmount: (tenancy as any).rentAmount,
          leaseStart: (tenancy as any).leaseStart?.toISOString() ?? null,
          leaseEnd: (tenancy as any).leaseEnd?.toISOString() ?? null
        };
      }

      return {
        unitId: uid,
        unitNumber: (u as any).unitNumber ?? (u as any).label ?? 'N/A',
        bedrooms: (u as any).bedrooms,
        bathrooms: (u as any).bathrooms,
        rent: (u as any).rent,
        status: tenancy ? 'OCCUPIED' : (u as any).status,
        squareFootage: (u as any).squareFootage ?? null,
        marketRent: (u as any).marketRent ?? null,
        tenant
      };
    });

    successResponse(res, { units: result, total: result.length });
  } catch (err: any) {
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'UNITS_FETCH_FAILED', err.message);
      return;
    }
    errorResponse(res, 500, 'UNITS_FETCH_FAILED', 'Failed to fetch units');
  }
}
