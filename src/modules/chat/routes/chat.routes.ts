import { Router } from 'express';
import { authMiddleware } from '../../../middleware/authMiddleware';
import { requireRole } from '../../../middleware/rbac.middleware';
import { CHAT_ALLOWED_ROLES } from '../constants/allowedRoles';
import {
  listThreadsHandler,
  createThreadHandler,
  getThreadHandler,
  getMessagesHandler,
  sendMessageHandler,
  findOrCreateThreadHandler,
  markThreadReadHandler,
} from '../controllers/chat.controller';
import { chatUploadHandler, chatFileSignedUrlHandler } from '../controllers/chatUpload.controller';
import { uploadSingle } from '../../docs/middleware/upload.middleware';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     ChatThreadSummary:
 *       type: object
 *       properties:
 *         threadId:
 *           type: string
 *           example: "507f1f77bcf86cd799439011"
 *         title:
 *           type: string
 *           nullable: true
 *         lastMessagePreview:
 *           type: string
 *           nullable: true
 *         lastMessageAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         unreadCount:
 *           type: integer
 *     ChatThread:
 *       type: object
 *       properties:
 *         threadId:
 *           type: string
 *         title:
 *           type: string
 *           nullable: true
 *         participantIds:
 *           type: array
 *           items:
 *             type: string
 *     ChatMessage:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         conversationId:
 *           type: string
 *         senderUserId:
 *           type: string
 *         body:
 *           type: string
 *         attachments:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id: { type: string }
 *               fileName: { type: string }
 *               fileType: { type: string }
 *               fileSize: { type: number }
 *               url: { type: string }
 *         readBy:
 *           type: array
 *           items: { type: string }
 *         createdAt:
 *           type: string
 *           format: date-time
 *         deletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *     SendMessageBody:
 *       type: object
 *       required: [body]
 *       properties:
 *         body:
 *           type: string
 *           minLength: 1
 *           maxLength: 10000
 *         attachments:
 *           type: array
 *           maxItems: 10
 *           items:
 *             type: object
 *             required: [id, fileName, fileType, fileSize, url]
 *             properties:
 *               id: { type: string }
 *               fileName: { type: string }
 *               fileType: { type: string }
 *               fileSize: { type: number }
 *               url: { type: string }
 */

/**
 * @swagger
 * /api/chat/threads:
 *   get:
 *     tags: [Chat]
 *     summary: List chat threads
 *     description: Returns threads the authenticated user (tenant or landlord) is a member of. Requires Bearer JWT.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 25
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Pagination cursor (last thread id)
 *     responses:
 *       200:
 *         description: List of threads and nextCursor
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
 *                     nextCursor: { type: string, nullable: true }
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (role not tenant/landlord)
 */
router.get(
  '/threads',
  authMiddleware,
  requireRole(CHAT_ALLOWED_ROLES),
  listThreadsHandler
);

/**
 * @swagger
 * /api/chat/threads:
 *   post:
 *     tags: [Chat]
 *     summary: Create a thread
 *     description: Create a new conversation. Creator is always a participant. If orgId is omitted, uses the current user's org (from tenancy or membership). All participantUserIds must be in the same org. Requires Bearer JWT.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               orgId:
 *                 type: string
 *                 pattern: '^[0-9a-fA-F]{24}$'
 *                 description: Optional. When omitted, uses current user's organization.
 *               participantUserIds:
 *                 type: array
 *                 items: { type: string }
 *                 maxItems: 20
 *                 default: []
 *               title:
 *                 type: string
 *                 maxLength: 255
 *               type:
 *                 type: string
 *                 enum: [direct, group, support]
 *                 default: direct
 *     responses:
 *       201:
 *         description: Thread created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     threadId: { type: string }
 *                     title: { type: string, nullable: true }
 *                     participantIds: { type: array, items: { type: string } }
 *       400:
 *         description: Validation error, or orgId required when user has no organization
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (org or participants not allowed)
 */
router.post(
  '/threads',
  authMiddleware,
  requireRole(CHAT_ALLOWED_ROLES),
  createThreadHandler
);

/**
 * @swagger
 * /api/chat/threads/{id}:
 *   get:
 *     tags: [Chat]
 *     summary: Get a thread by id
 *     description: Returns thread details if the user is a participant. Requires Bearer JWT.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^[0-9a-fA-F]{24}$'
 *     responses:
 *       200:
 *         description: Thread details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/ChatThread' }
 *       400:
 *         description: Invalid thread id
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not a participant)
 */
router.post(
  '/upload',
  authMiddleware,
  requireRole(CHAT_ALLOWED_ROLES),
  uploadSingle,
  chatUploadHandler
);

router.get(
  '/files/signed-url',
  authMiddleware,
  requireRole(CHAT_ALLOWED_ROLES),
  chatFileSignedUrlHandler
);

router.post(
  '/threads/with/:userId',
  authMiddleware,
  requireRole(CHAT_ALLOWED_ROLES),
  findOrCreateThreadHandler
);

router.get(
  '/threads/:id',
  authMiddleware,
  requireRole(CHAT_ALLOWED_ROLES),
  getThreadHandler
);

/**
 * @swagger
 * /api/chat/threads/{id}/messages:
 *   get:
 *     tags: [Chat]
 *     summary: Get messages in a thread (paginated)
 *     description: Cursor-based pagination. Requires Bearer JWT and participant access.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 25
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: messages and nextCursor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     messages:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ChatMessage'
 *                     nextCursor: { type: string, nullable: true }
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not a participant)
 *   post:
 *     tags: [Chat]
 *     summary: Send a message in a thread
 *     description: Requires Bearer JWT and participant access.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SendMessageBody'
 *     responses:
 *       201:
 *         description: Created message
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/ChatMessage' }
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not a participant)
 */
router.get(
  '/threads/:id/messages',
  authMiddleware,
  requireRole(CHAT_ALLOWED_ROLES),
  getMessagesHandler
);
router.post(
  '/threads/:id/messages',
  authMiddleware,
  requireRole(CHAT_ALLOWED_ROLES),
  sendMessageHandler
);

router.post(
  '/threads/:id/read',
  authMiddleware,
  requireRole(CHAT_ALLOWED_ROLES),
  markThreadReadHandler
);

export default router;
