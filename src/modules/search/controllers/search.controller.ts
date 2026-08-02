import { Response } from 'express';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { SearchQuerySchema } from '../dto/search.dto';
import { runSearch } from '../services/search.service';
import { logSearch } from '../../search-log/services/search-log.service';
import { getActionsForRole } from '../services/action-search.service';
import { searchAccessGuard } from '../guards/search-access.guard';

export async function search(req: AuthenticatedRequest, res: Response): Promise<void> {
  const parsed = SearchQuerySchema.safeParse({ q: req.query['q'] });
  if (!parsed.success) {
    errorResponse(res, 400, 'VALIDATION_ERROR', 'Query param "q" must be 2–200 characters', parsed.error.flatten());
    return;
  }

  const auth = req.auth!;
  const guard = searchAccessGuard(auth);
  if (!guard.allowed) {
    errorResponse(res, guard.status, guard.code, guard.message);
    return;
  }

  const results = await runSearch(parsed.data.q, guard.ctx);

  // Fire-and-forget — logging must never block or fail the search response
  const logId = await logSearch({
    userId: String(auth._id),
    query: parsed.data.q,
    role: auth.role,
    resultsCount: results.length,
  }).catch(() => undefined);

  successResponse(res, { results, logId });
}

export function listActions(req: AuthenticatedRequest, res: Response): void {
  const auth = req.auth!;
  const actions = getActionsForRole(auth.role);
  successResponse(res, { actions });
}
