import { Response } from "express";
import { z, ZodError } from "zod";
import { AppError } from "../../../core/errors/AppError";
import { successResponse, errorResponse } from "../../../core/utils/response";
import { resolveLandlordOrgId } from "../../dashboard/services/landlordDashboard.service";
import type { AuthenticatedRequest } from "../../auth/types/auth-request";
import { CreateRewardsCampaignSchema } from "../dto/rewardsCampaignDTO";
import { createRewardsCampaign, listRewardsCampaigns } from "../services/rewardsCampaigns.service";

const ListQuerySchema = z.object({
  propertyId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

function handleError(res: Response, err: unknown): void {
  if (err instanceof ZodError) {
    errorResponse(res, 400, "VALIDATION_ERROR", err.issues[0]?.message ?? "Validation error");
    return;
  }
  if (err instanceof AppError) {
    errorResponse(res, err.statusCode, "APP_ERROR", err.message);
    return;
  }
  errorResponse(res, 500, "INTERNAL_ERROR", "Internal server error");
}

export async function createRewardsCampaignHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.auth?._id;
    if (!userId) { errorResponse(res, 401, "UNAUTHORIZED", "Unauthorized"); return; }

    const dto = CreateRewardsCampaignSchema.parse(req.body);
    const orgId = await resolveLandlordOrgId(userId as any);
    const created = await createRewardsCampaign(orgId, dto);
    successResponse(res, created, 201);
  } catch (err) {
    handleError(res, err);
  }
}

export async function listRewardsCampaignsHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.auth?._id;
    if (!userId) { errorResponse(res, 401, "UNAUTHORIZED", "Unauthorized"); return; }

    const query = ListQuerySchema.parse(req.query);
    const orgId = await resolveLandlordOrgId(userId as any);
    const campaigns = await listRewardsCampaigns(orgId, { propertyId: query.propertyId, limit: query.limit });
    successResponse(res, campaigns);
  } catch (err) {
    handleError(res, err);
  }
}

