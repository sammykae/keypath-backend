import { Router } from 'express';
import { authMiddleware } from '../../../middleware/authMiddleware';
import { requireRole } from '../../../middleware/rbac.middleware';
import {
  listGoodStandingHandler,
  getTenantGoodStandingHandler,
  flagTenantHandler,
  resolveFlagHandler,
  setOverrideHandler,
} from '../controllers/goodStanding.controller';

const router = Router();

router.use(authMiddleware);

/**
 * @swagger
 * /api/landlord/good-standing:
 *   get:
 *     summary: Good Standing status for every tenant in the org
 *     description: Auto-computed from rent arrears, tenancy status, and landlord flags. Admin override wins. Org-scoped.
 *     tags: [Landlord, GoodStanding]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: tenants[] with status (ACTIVE/AT_RISK/PAUSED/SUSPENDED), reasons, flags, eligibility
 */
router.get('/', requireRole(['landlord', 'admin']), listGoodStandingHandler);

/**
 * @swagger
 * /api/landlord/good-standing/{tenantUserId}:
 *   get:
 *     summary: Good Standing detail for one tenant
 *     tags: [Landlord, GoodStanding]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantUserId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: standing (status, reasons, activeFlags, eligibility)
 */
router.get('/:tenantUserId', requireRole(['landlord', 'admin']), getTenantGoodStandingHandler);

/**
 * @swagger
 * /api/landlord/good-standing/{tenantUserId}/flags:
 *   post:
 *     summary: Flag a tenant issue (affects Good Standing)
 *     description: Flag types map to severity — EVICTION/FRAUD → SUSPENDED, LEASE_VIOLATION → PAUSED, others → AT_RISK. Audit-logged.
 *     tags: [Landlord, GoodStanding]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantUserId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, note]
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [EVICTION, LEASE_VIOLATION, DAMAGE_CLAIM, UNAUTHORIZED_OCCUPANT, FRAUD, OTHER]
 *               note:
 *                 type: string
 *     responses:
 *       201:
 *         description: Updated standing
 */
router.post('/:tenantUserId/flags', requireRole(['landlord', 'admin']), flagTenantHandler);

/**
 * @swagger
 * /api/landlord/good-standing/{tenantUserId}/flags/{flagId}/resolve:
 *   patch:
 *     summary: Resolve an active flag
 *     tags: [Landlord, GoodStanding]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantUserId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: flagId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated standing
 */
router.patch('/:tenantUserId/flags/:flagId/resolve', requireRole(['landlord', 'admin']), resolveFlagHandler);

/**
 * @swagger
 * /api/landlord/good-standing/{tenantUserId}/override:
 *   patch:
 *     summary: Set or clear a manual Good Standing override (ADMIN only)
 *     description: Pass status=null to clear. Override wins over the auto-computed status. Audit-logged.
 *     tags: [Landlord, GoodStanding]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantUserId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, AT_RISK, PAUSED, SUSPENDED]
 *                 nullable: true
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated standing
 */
router.patch('/:tenantUserId/override', requireRole(['admin']), setOverrideHandler);

export default router;
