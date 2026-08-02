import { Request, Response, NextFunction } from 'express';
import { logger } from '../../../core/logger';
import { errorResponse } from '../../../core/utils/response';
import { isAskAiEnabledRuntime } from '../services/askAiFeatureFlag.service';

export const askAiFeatureFlagMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Async wrapper keeps Express middleware signature while allowing awaited flag resolution.
  void (async () => {
    const enabled = await isAskAiEnabledRuntime();
    // Hard stop all Ask AI traffic when runtime kill switch is disabled.
    if (!enabled) {
      logger.warn(
        {
          path: req.path,
          method: req.method,
        },
        'Ask AI feature is disabled'
      );

      errorResponse(
        res,
        503,
        'ASK_AI_DISABLED',
        'The Ask AI feature is currently disabled. Please try again later.'
      );
      return;
    }

    next();
  })().catch((error) => {
    logger.error({ error, path: req.path, method: req.method }, 'Ask AI feature flag middleware failed');
    errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', 'Ask AI availability check failed');
  });
};
