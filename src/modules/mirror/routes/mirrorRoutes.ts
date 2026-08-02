import express from 'express';
import { getMirrorPreview, getMirrorStatus, getReconciliation } from '../controllers/mirrorController';
import { adminGuard } from '../../properties/middleware/adminGuard';
import { authMiddleware } from '../../../middleware/authMiddleware';

const router = express.Router();

// All mirror routes require admin access
router.use(authMiddleware);
router.use(adminGuard);

/**
 * @swagger
 * /api/admin/mirror/preview:
 *   get:
 *     summary: Get mirror preview (Admin only)
 *     tags: [Mirror]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mirror preview data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
router.get('/preview', getMirrorPreview);

/**
 * @swagger
 * /api/admin/mirror/status:
 *   get:
 *     summary: Get mirror status (Admin only)
 *     tags: [Mirror]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mirror status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
router.get('/status', getMirrorStatus);

/**
 * @swagger
 * /api/admin/mirror/reconcile:
 *   get:
 *     summary: Get reconciliation data (Admin only)
 *     tags: [Mirror]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reconciliation data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
router.get('/reconcile', getReconciliation);

export default router;

