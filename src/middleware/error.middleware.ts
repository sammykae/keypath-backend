
import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodIssue } from 'zod';
import { errorResponse } from '../core/utils/response';

export default function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error('[ERROR]', err);

  if (err instanceof ZodError) {
    return errorResponse(
      res,
      400,
      'VALIDATION_ERROR',
      'Request validation failed',
      err.issues.map((issue: ZodIssue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      }))
    );
  }

  return errorResponse(
    res,
    500,
    'INTERNAL_SERVER_ERROR',
    'Something went wrong',
    process.env.NODE_ENV === 'development'
      ? (err instanceof Error ? err.stack : undefined)
      : undefined
  );
}
