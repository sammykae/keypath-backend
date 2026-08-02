import { Request, Response, NextFunction } from 'express';
import { Membership, OrgRole } from '../models/membership.model';
import { errorResponse } from '../../../core/utils/response';

export const requireOrgRole = (roles: OrgRole[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as any;
    const orgId = req.params.orgId || req.body.orgId;

    // Codex: keep middleware resilient when route auth is missing or misordered.
    if (!user?._id) {
      return errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    }

    if (!orgId) {
      return errorResponse(res, 400, 'ORG_ID_REQUIRED', 'orgId is required');
    }

    // Allow global ADMIN users to perform org actions without membership
    const globalRole = user?.role?.toLowerCase?.();
    if (globalRole === 'admin') {
      return next();
    }

    const membership = await Membership.findOne({
      userId: user._id,
      orgId,
      // Codex: only active memberships can grant org-level permissions.
      status: 'active',
    });

    if (!membership || !roles.includes(membership.roleInOrg)) {
      return errorResponse(
        res,
        403,
        'FORBIDDEN',
        'Insufficient org permissions'
      );
    }

    next();
  };
};
