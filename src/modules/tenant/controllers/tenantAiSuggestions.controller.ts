import { Response } from 'express';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { getTenantAiSuggestions } from '../services/tenantAiSuggestions.service';

export async function getTenantAiSuggestionsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.auth?._id) {
    errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return;
  }
  try {
    const suggestions = await getTenantAiSuggestions(req.auth._id as any);
    successResponse(res, { suggestions });
  } catch (err: any) {
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to fetch suggestions');
  }
}
