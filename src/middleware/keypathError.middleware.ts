// src/middleware/keypathError.middleware.ts

import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodIssue } from 'zod';
import { errorResponse } from '../core/utils/response';

export function keypathErrorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error('[KEYPATH ERROR]', err);

  // 1. Zod validation errors → 400 + standard envelope
  if (err instanceof ZodError) {
    return errorResponse(
      res,
      400,
      'VALIDATION_ERROR',
      'Request validation failed',
      err.issues.map((e: ZodIssue) => ({
        path: e.path.join('.'),
        message: e.message,
        code: e.code,
      }))
    );
  }

  // 2. Common auth / RBAC errors
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();

    if (
      msg.includes('unauthorized') ||
      msg.includes('authentication required')
    ) {
      return errorResponse(
        res, 
        401,
        'UNAUTHORIZED',
        'Authentication required'
      );
    }

    if (
      msg.includes('forbidden') ||
      msg.includes('insufficient permissions')
    ) {
      return errorResponse(
        res,
        403,
        'FORBIDDEN',
        'Insufficient permissions'
      );
    }

    if (msg.includes('not found')) {
      return errorResponse(
        res,
        404,
        'NOT_FOUND',
        err.message || 'Resource not found'
      );
    }
  }

  next(err);
}
