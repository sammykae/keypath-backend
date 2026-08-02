import { Response } from "express";
import { AuthenticatedRequest } from "../../auth/types/auth-request";
import { getLandlordDashboard } from "../services/landlordDashboard.service";
import { AppError } from "../../../core/errors/AppError";

export const getTenantDashboard = (req: AuthenticatedRequest, res: Response) => {
  const role = req.auth?.role;
  if (role !== "tenant" && role !== "admin") {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  res.json({ message: "Tenant dashboard data (mock)" });
};

export const getLandlordDashboardHandler = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.auth?._id) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (req.auth.role !== "landlord" && req.auth.role !== "admin") {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    const result = await getLandlordDashboard(req.auth._id as any);
    res.status(200).json(result);
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error("Landlord dashboard error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
