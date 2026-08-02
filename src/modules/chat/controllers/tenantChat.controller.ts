import { Response } from 'express';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { listTenantThreads } from '../services/chat.service';
import { resolveOrgIdForUser } from '../services/participantRules.service';
import { Organization } from '../../orgs/models/organization.model';
import { Membership } from '../../orgs/models/membership.model';
import { User } from '../../auth/models/user.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { UnitModel } from '../../units/models/unit.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { logger } from '../../../core/logger';

export async function getTenantChatThreadsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.auth) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }

    const userId = req.auth._id.toString();
    const { threads } = await listTenantThreads(userId);

    // Landlord direct-chat toggle — lets the FE hide "Chat with Landlord" when disabled
    let allowDirectLandlordChat = true;
    const orgId = await resolveOrgIdForUser(userId);
    if (orgId) {
      const org = await Organization.findById(orgId).lean();
      allowDirectLandlordChat = org?.settings?.allowDirectTenantMessaging ?? true;
    }

    successResponse(res, { threads, allowDirectLandlordChat });
  } catch (e) {
    logger.error({ err: e }, 'getTenantChatThreads failed');
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to list chat threads');
  }
}

/**
 * GET /api/tenants/chat/landlord-contact
 * Resolves the tenant's landlord (org owner) so the tenant can start a direct chat.
 * Returns allowDirectLandlordChat so the FE can gate the button.
 */
export async function getTenantLandlordContactHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.auth) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }

    const tenancy = await TenancyModel.findOne({
      tenantUserId: req.auth._id,
      status: 'ACTIVE',
    }).lean();
    if (!tenancy) {
      errorResponse(res, 404, 'NOT_FOUND', 'No active tenancy found');
      return;
    }

    const unit = await UnitModel.findById(tenancy.unitId).lean();
    const property = unit ? await PropertyModel.findById((unit as any).propertyId).lean() : null;
    if (!property) {
      errorResponse(res, 404, 'NOT_FOUND', 'Property not found');
      return;
    }

    const [org, membership] = await Promise.all([
      Organization.findById((property as any).orgId).lean(),
      Membership.findOne({ orgId: (property as any).orgId, roleInOrg: 'OWNER' }).lean(),
    ]);
    const landlord = membership ? await User.findById((membership as any).userId).lean() : null;
    if (!landlord) {
      errorResponse(res, 404, 'NOT_FOUND', 'Landlord not found');
      return;
    }

    const firstName = (landlord as any).profile?.firstName ?? '';
    const lastName = (landlord as any).profile?.lastName ?? '';
    const name = `${firstName} ${lastName}`.trim() || (landlord as any).email;

    successResponse(res, {
      contact: {
        userId: (landlord as any)._id.toString(),
        name,
        email: (landlord as any).email,
        avatarUrl: (landlord as any).profile?.avatarUrl ?? null,
        propertyId: (property as any)._id.toString(),
        propertyName: (property as any).name ?? null,
      },
      allowDirectLandlordChat: org?.settings?.allowDirectTenantMessaging ?? true,
    });
  } catch (e) {
    logger.error({ err: e }, 'getTenantLandlordContact failed');
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to resolve landlord contact');
  }
}
