import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { errorResponse } from '../core/utils/response';
import { AuthenticatedRequest } from '../modules/auth/types/auth-request';
import { UserRole } from '../modules/auth/types/auth-user';

const JWT_SECRET = process.env.JWT_SECRET as string;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined');
}

const normalizeRole = (rawRole: unknown): UserRole => {
  const role = String(rawRole ?? '').toLowerCase();
  if (role === 'community' || role === 'stakeholder' || role === 'community_stakeholder') {
    return 'community_stakeholder';
  }
  if (role === 'tenant' || role === 'landlord' || role === 'admin' || role === 'investor' || role === 'property_manager') {
    return role as UserRole;
  }
  return 'tenant';
};

// Attaches req.auth if a valid Bearer token is present, but never rejects —
// used on endpoints that need to know who is calling without hard-requiring auth.
export const optionalAuthMiddleware = (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET) as {
        sub: string;
        email: string;
        role: string;
        orgId?: string;
      };
      req.auth = {
        _id: decoded.sub as any,
        email: decoded.email,
        role: normalizeRole(decoded.role),
        orgId: decoded.orgId ?? null,
      };
    } catch {
      // Token present but invalid — ignore, let handler decide
    }
  }
  next();
};

export const authMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return errorResponse(res, 401, 'UNAUTHORIZED', 'Missing Authorization header');
  }

  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET) as {
      sub: string;
      email: string;
      role: string;
      orgId?: string;
      type?: string;
    };

    // Refresh tokens are only valid at /api/auth/refresh — never as access tokens
    if (decoded.type === 'refresh') {
      return errorResponse(res, 401, 'UNAUTHORIZED', 'Invalid or expired token');
    }

    req.auth = {
      _id: decoded.sub as any,
      email: decoded.email,
      role: normalizeRole(decoded.role),
      orgId: decoded.orgId ?? null,
    };

    next();
  } catch {
    return errorResponse(res, 401, 'UNAUTHORIZED', 'Invalid or expired token');
  }
};
