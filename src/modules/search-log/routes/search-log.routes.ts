import { Router } from 'express';
import { authMiddleware } from '../../../middleware/authMiddleware';
import { trackClick } from '../controllers/search-log.controller';

const router = Router();

/**
 * @swagger
 * /api/search/click:
 *   post:
 *     summary: Record which search result the user clicked
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [logId, type, label, route, rank]
 *             properties:
 *               logId:
 *                 type: string
 *                 description: The ID returned by GET /api/search
 *               type:
 *                 type: string
 *                 enum: [tenant, property, unit, action, help]
 *               label:
 *                 type: string
 *               route:
 *                 type: string
 *               rank:
 *                 type: integer
 *                 minimum: 0
 *                 description: Zero-based position in the results list
 *     responses:
 *       200:
 *         description: Click recorded
 *       400:
 *         description: Invalid payload
 *       401:
 *         description: Unauthorized
 */
router.post('/click', authMiddleware, trackClick);

export default router;
