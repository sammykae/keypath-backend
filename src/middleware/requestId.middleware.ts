
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export default function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const existingId = req.get('X-Request-ID') || req.query.requestId;
  const requestId = existingId ? String(existingId) : uuidv4();

  res.locals.requestId = requestId;
  res.set('X-Request-ID', requestId);

  next();
}