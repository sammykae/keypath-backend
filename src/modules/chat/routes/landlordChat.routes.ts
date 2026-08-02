import { Router } from 'express';
import { authMiddleware } from '../../../middleware/authMiddleware';
import { requireRole } from '../../../middleware/rbac.middleware';
import { listPMTenantThreadsHandler, getPMThreadMessagesHandler } from '../controllers/landlordChat.controller';

const router = Router();

router.use(authMiddleware);
router.use(requireRole(['landlord', 'admin']));

/**
 * @swagger
 * /api/landlord/chat/pm-threads:
 *   get:
 *     summary: List Property Manager ↔ Tenant threads in the org (read-only, for context)
 *     description: >
 *       The landlord is not a participant in these threads and cannot send messages here —
 *       this is read-only visibility per Laurel's docs ("Landlord should be able to view
 *       the tenant/property manager chat for context"). Use the direct-chat toggle and
 *       /api/chat/threads/with/:userId to message a tenant directly instead.
 *     tags: [Landlord, Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: threads[] (propertyId, propertyName, tenantName, propertyManagerName, lastMessagePreview)
 */
router.get('/pm-threads', listPMTenantThreadsHandler);

/**
 * @swagger
 * /api/landlord/chat/pm-threads/{threadId}/messages:
 *   get:
 *     summary: Read messages in a Property Manager ↔ Tenant thread
 *     tags: [Landlord, Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: threadId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: messages[]
 *       404:
 *         description: Not found, or not a PM/tenant thread in your org
 */
router.get('/pm-threads/:threadId/messages', getPMThreadMessagesHandler);

export default router;
