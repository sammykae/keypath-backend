import { Response } from 'express';
import { z } from 'zod';
import { errorResponse, successResponse } from '../../../core/utils/response';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import {
  resolveAskAiFlagStatus,
  setAskAiRuntimeFlag,
} from '../services/askAiFeatureFlag.service';

const updateAskAiFlagSchema = z.object({
  // Admin payload for runtime toggle.
  enabled: z.boolean(),
});

export const getAskAiFeatureFlagHandler = async (
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    // Returns effective flag status and source (runtime/env).
    const status = await resolveAskAiFlagStatus();
    successResponse(res, status);
  } catch {
    errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to read Ask AI feature flag');
  }
};

export const updateAskAiFeatureFlagHandler = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const parsed = updateAskAiFlagSchema.safeParse(req.body);
    if (!parsed.success) {
      errorResponse(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid payload');
      return;
    }

    // Persist actor for auditability of production toggles.
    const actorUserId = req.auth?._id ? String(req.auth._id) : undefined;
    // orgId enables org-scoped activity feed logging for this admin action.
    const actorOrgId = req.auth?.orgId ?? null;
    const status = await setAskAiRuntimeFlag(parsed.data.enabled, actorUserId, actorOrgId);
    successResponse(res, status);
  } catch {
    errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to update Ask AI feature flag');
  }
};
