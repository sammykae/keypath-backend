import { Router } from 'express';
import { authMiddleware } from '../../../middleware/authMiddleware';
import { requireRole } from '../../../middleware/rbac.middleware';
import { triggerRebuild, getIndexStatus } from '../controllers/search-index.controller';

const router = Router();

/**
 * @swagger
 * /api/admin/search-index/rebuild:
 *   post:
 *     summary: Rebuild the full search index from source collections (admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Index rebuilt successfully with counts and duration
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
router.post('/rebuild', authMiddleware, requireRole(['admin']), triggerRebuild);

/**
 * @swagger
 * /api/admin/search-index/status:
 *   get:
 *     summary: Get search index entry counts by type (admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Index status with counts per entity type
 */
router.get('/status', authMiddleware, requireRole(['admin']), getIndexStatus);

export default router;
