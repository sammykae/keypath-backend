
import { Request, Response, NextFunction } from 'express';

export default function loggerMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const requestId = res.locals.requestId || 'unknown';

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${requestId}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });

  next();
}