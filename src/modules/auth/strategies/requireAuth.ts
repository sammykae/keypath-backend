import { Request, Response, NextFunction } from 'express';
import { errorResponse } from '../../../core/utils/response';

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
  }
  next();
}
