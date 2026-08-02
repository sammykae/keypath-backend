import { Router } from 'express';
import { authMiddleware } from '../../../middleware/authMiddleware';
import { listAuditActivityByPropertyHandler } from '../controllers/auditActivityLog.controller';

const router = Router();

/**
 * @swagger
 * /api/activity-logs:
 *   get:
 *     summary: List audit events for a property (audit_events)
 *     tags: [ActivityLog]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: entityType
 *         schema:
 *           type: string
 *           enum: [PROPERTY, TENANT, TENANCY, DOCUMENT, LEDGER, TOKEN, CSV_IMPORT, ADMIN, UNIT]
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *       - in: query
 *         name: actorUserId
 *         schema:
 *           type: string
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Paginated audit rows scoped to propertyId
 */
router.get('/', authMiddleware, listAuditActivityByPropertyHandler);

export default router;
