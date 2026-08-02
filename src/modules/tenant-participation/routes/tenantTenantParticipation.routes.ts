import { Router } from 'express';
import { authMiddleware } from '../../../middleware/authMiddleware';
import { requireRole } from '../../../middleware/rbac.middleware';
import { getTenantSelfParticipationHandler } from '../controllers/tenantTenantParticipation.controller';

const router = Router();

/**
 * GET /api/tenant/participation?tenancyId=
 * Tenant reads own participation for a lease they hold.
 */
router.get(
  '/participation',
  authMiddleware,
  requireRole(['tenant']),
  getTenantSelfParticipationHandler
);

export default router;
