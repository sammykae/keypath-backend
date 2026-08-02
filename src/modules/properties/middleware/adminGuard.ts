import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../../auth/types/auth-request";

export const adminGuard = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  const role = req.auth?.role?.toLowerCase();
  if (role !== "admin") {
    res.status(403).json({ error: "Admin access only" });
    return;
  }
  next();
};
