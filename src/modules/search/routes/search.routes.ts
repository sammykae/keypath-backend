import { Router } from 'express';
import { authMiddleware } from '../../../middleware/authMiddleware';
import { search, listActions } from '../controllers/search.controller';

const router = Router();

/**
 * @swagger
 * /api/search:
 *   get:
 *     summary: Role-based search — entities, actions, and navigation targets
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 200
 *         description: Search query (min 2 chars). Supports partial matches.
 *     responses:
 *       200:
 *         description: Ranked search results scoped to the caller's role
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                             enum: [tenant, property, unit, action, help]
 *                           label:
 *                             type: string
 *                           subLabel:
 *                             type: string
 *                           route:
 *                             type: string
 *                           confidence:
 *                             type: number
 *                             minimum: 0
 *                             maximum: 1
 *       400:
 *         description: Missing or invalid query param
 *       401:
 *         description: Unauthorized
 */
router.get('/', authMiddleware, search);

/**
 * @swagger
 * /api/search/actions:
 *   get:
 *     summary: List all available actions for the current user's role (command palette)
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All actions available to the caller's role, grouped by category
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     actions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           label:
 *                             type: string
 *                           description:
 *                             type: string
 *                           route:
 *                             type: string
 *                           category:
 *                             type: string
 *       401:
 *         description: Unauthorized
 */
router.get('/actions', authMiddleware, listActions);

export default router;
