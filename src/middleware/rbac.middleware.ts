import { Response, NextFunction } from 'express';
import { errorResponse } from '../core/utils/response';
import { AuthenticatedRequest } from '../modules/auth/types/auth-request';
import { UserRole } from '../modules/auth/types/auth-user';

const normalizeRole = (role?: string | null): UserRole => {
  const r = String(role ?? '').toLowerCase();
  if (r === 'community' || r === 'stakeholder' || r === 'community_stakeholder') {
    return 'community_stakeholder';
  }
  if (r === 'tenant' || r === 'landlord' || r === 'admin' || r === 'investor' || r === 'property_manager') {
    return r;
  }
  return 'tenant';
};

export const requireRole = (allowedRoles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    }

    const actorRole = normalizeRole(req.auth.role);
    const normalizedAllowedRoles = allowedRoles.map((role) => normalizeRole(role));
    if (!normalizedAllowedRoles.includes(actorRole)) {
      return errorResponse(res, 403, 'FORBIDDEN', 'Insufficient permissions');
    }

    next();
  };
};
