import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { UserRole } from '../../auth/types/auth-user';

export function normalizeRoleForRbac(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  if (req.auth?.role != null) {
    req.auth.role = (String(req.auth.role)).toLowerCase() as UserRole;
  }
  next();
}
