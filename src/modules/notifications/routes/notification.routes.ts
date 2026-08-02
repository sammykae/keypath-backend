import { Router } from 'express';
import { authMiddleware } from '../../../middleware/authMiddleware';
import {
  listNotificationsHandler,
  getUnreadCountHandler,
  markNotificationReadHandler,
  markAllNotificationsReadHandler,
} from '../controllers/notification.controller';

const router = Router();
router.use(authMiddleware);

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: List the authenticated user's notifications (any role — tenant, landlord, property_manager, admin)
 *     description: Real, persisted, backend-generated notifications — not a derived/re-computed feed. Per-notification read status.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 25, maximum: 100 }
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *       - in: query
 *         name: unreadOnly
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: "{ notifications[], nextCursor, unreadCount }"
 */
router.get('/', listNotificationsHandler);

/**
 * @swagger
 * /api/notifications/unread-count:
 *   get:
 *     summary: Unread notification count for the authenticated user
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "{ unreadCount }"
 */
router.get('/unread-count', getUnreadCountHandler);

/**
 * @swagger
 * /api/notifications/mark-all-read:
 *   post:
 *     summary: Mark all of the authenticated user's notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "{ updated }"
 */
router.post('/mark-all-read', markAllNotificationsReadHandler);

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   patch:
 *     summary: Mark one notification as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated notification
 *       404:
 *         description: Notification not found (or not owned by this user)
 */
router.patch('/:id/read', markNotificationReadHandler);

export default router;
