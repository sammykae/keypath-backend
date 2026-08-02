import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET as string | undefined;

export interface AskAiUser {
  userId: string;
  role: 'tenant' | 'landlord' | 'stakeholder' | 'admin';
  orgId?: string | null;
}

export const optionalAuthMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ') || !JWT_SECRET) {
    next();
    return;
  }

  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET) as {
      sub: string;
      email?: string;
      role: 'tenant' | 'landlord' | 'stakeholder' | 'admin';
      orgId?: string;
    };
    (req as any).user = {
      userId: decoded.sub,
      role: decoded.role,
      orgId: decoded.orgId ?? null,
    } as AskAiUser;
  } catch {
    (req as any).user = undefined;
  }
  next();
};
