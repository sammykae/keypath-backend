
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { errorResponse } from '../core/utils/response';

export const validateRequest = (schema: z.ZodTypeAny) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      next();
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        // Explicit cast — this is required for ts-node 10.9.2
        const zodError = err as z.ZodError;

        return errorResponse(
          res,
          400,
          'VALIDATION_ERROR',
          'Invalid request data',
          zodError.issues.map((issue: z.ZodIssue) => ({
            path: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          }))
        );
      }

      next(err);
    }
  };
};