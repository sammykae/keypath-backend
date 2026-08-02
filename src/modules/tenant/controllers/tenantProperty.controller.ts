import { Response } from "express";
import { getTenantProperty } from "../services/tenantProperty.service";
import { AppError } from "../../../core/errors/AppError";
import { AuthenticatedRequest } from "../../auth/types/auth-request";

/** BE-105: GET /tenant/property — Tenant only sees their assigned unit/property; 200 with unassigned structure when no tenancy. */
export const getTenantPropertyHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantUserId = req.auth?._id?.toString();
    if (!tenantUserId) {
      res.status(401).json({ error: "Unauthorized: user ID required" });
      return;
    }
    const result = await getTenantProperty(tenantUserId);
    res.status(200).json(result);
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      console.error("Unexpected error in get tenant property:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
};
