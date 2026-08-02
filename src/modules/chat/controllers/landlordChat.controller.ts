import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { listPMTenantThreadsForOrg, getPMThreadMessagesForLandlord } from '../services/chat.service';
import { resolveLandlordOrgId } from '../../landlord/services/landlordDashboard.service';

/** GET /api/landlord/chat/pm-threads — read-only visibility into PM↔tenant conversations. */
export async function listPMTenantThreadsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const orgId = await resolveLandlordOrgId(new mongoose.Types.ObjectId(req.auth._id.toString()));
    const threads = await listPMTenantThreadsForOrg(new mongoose.Types.ObjectId(orgId));
    successResponse(res, { threads });
  } catch {
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to list property manager threads');
  }
}

/** GET /api/landlord/chat/pm-threads/:threadId/messages — read-only, no read-receipt side effects. */
export async function getPMThreadMessagesHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const orgId = await resolveLandlordOrgId(new mongoose.Types.ObjectId(req.auth._id.toString()));
    const messages = await getPMThreadMessagesForLandlord(new mongoose.Types.ObjectId(orgId), req.params.threadId);
    if (messages === null) {
      errorResponse(res, 404, 'NOT_FOUND', 'Thread not found or is not a property-manager/tenant conversation');
      return;
    }
    successResponse(res, { messages });
  } catch {
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to fetch thread messages');
  }
}
