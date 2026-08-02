import { Response } from "express";
import { createReward, listRewards } from "../services/reward.service";
import { CreateRewardBodySchema } from "../dto/reward.dto";
import { AppError } from "../../../core/errors/AppError";
import { AuthenticatedRequest } from "../../auth/types/auth-request";
import { resolveLandlordOrgId } from "../../landlord/services/landlordDashboard.service";

/**
 * POST /landlord/rewards — create reward for landlord's org
 */
export async function createRewardHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.auth?._id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const orgId = await resolveLandlordOrgId(userId as any);
    const body = CreateRewardBodySchema.parse(req.body);

    const reward = await createReward({
      name: body.name,
      creditCost: body.creditCost,
      orgId: body.orgId !== undefined ? body.orgId : orgId,
    });

    res.status(201).json(reward);
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
    } else if (err.name === "ZodError") {
      res.status(400).json({ error: "Validation error", details: err.errors });
    } else {
      console.error("Unexpected error in create reward:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

/**
 * GET /landlord/rewards — list rewards for landlord's org + global
 */
export async function listLandlordRewardsHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.auth?._id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const orgId = await resolveLandlordOrgId(userId as any);
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;

    const result = await listRewards({ orgId, limit, cursor });
    res.status(200).json(result);
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      console.error("Unexpected error in list landlord rewards:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

/**
 * GET /tenants/rewards — list all available rewards for tenant
 */
export async function listTenantRewardsHandler(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.auth?._id) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;

    const result = await listRewards({ orgId: undefined, limit, cursor });
    res.status(200).json(result);
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      console.error("Unexpected error in list tenant rewards:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
}
