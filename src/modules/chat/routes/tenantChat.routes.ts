import { Router } from 'express';
import { authMiddleware } from '../../../middleware/authMiddleware';
import { requireRole } from '../../../middleware/rbac.middleware';
import { TENANT_CHAT_ALLOWED_ROLES } from '../constants/allowedRoles';
import { getTenantChatThreadsHandler, getTenantLandlordContactHandler } from '../controllers/tenantChat.controller';

const router = Router();

/**
 * @swagger
 * /api/tenants/chat/threads:
 *   get:
 *     tags: [Chat, Tenants]
 *     summary: List chat threads (tenant only)
 *     description: Returns threads the authenticated tenant belongs to. Role TENANT required. Same shape as ChatThreadSummary (threadId, title, lastMessagePreview, lastMessageAt, unreadCount).
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: success and threads array (empty if none)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     threads:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ChatThreadSummary'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not a tenant)
 */
router.get(
  '/threads',
  authMiddleware,
  requireRole(TENANT_CHAT_ALLOWED_ROLES),
  getTenantChatThreadsHandler
);

/**
 * @swagger
 * /api/tenants/chat/landlord-contact:
 *   get:
 *     tags: [Chat, Tenants]
 *     summary: Get the tenant's landlord contact for starting a direct chat
 *     description: Resolves the landlord (org owner) of the tenant's active tenancy. Includes allowDirectLandlordChat so the UI can hide the New Chat button when the landlord disabled direct messaging.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "{ contact: { userId, name, email, avatarUrl, propertyId, propertyName }, allowDirectLandlordChat }"
 *       404:
 *         description: No active tenancy / landlord found
 */
router.get(
  '/landlord-contact',
  authMiddleware,
  requireRole(TENANT_CHAT_ALLOWED_ROLES),
  getTenantLandlordContactHandler
);

export default router;
