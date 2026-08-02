import { Request, Response, NextFunction } from 'express';
import { logger } from '../../../core/logger';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  enabled: boolean;
}

const RATE_LIMIT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000,
  maxRequests: 20,
  enabled: false,
};

export const askAiRateLimitMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  logger.debug(
    {
      path: req.path,
      method: req.method,
      rateLimitEnabled: RATE_LIMIT_CONFIG.enabled,
    },
    'Rate limit check (placeholder)'
  );

  if (!RATE_LIMIT_CONFIG.enabled) {
    next();
    return;
  }

  next();
};

export const getRateLimitStatus = (): RateLimitConfig => {
  return { ...RATE_LIMIT_CONFIG };
};
