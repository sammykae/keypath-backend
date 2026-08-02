import { Router } from 'express';
import { authMiddleware } from '../../../middleware/authMiddleware';
import { requireRole } from '../../../middleware/rbac.middleware';
import { normalizeRoleForRbac } from '../../tenant/middleware/normalizeRoleForRbac';
import {
  getLandlordRewardsHandler,
  postLandlordRewardsHandler,
  patchLandlordRewardHandler,
} from '../controllers/landlordRewards.controller';

const router = Router();

/**
 * @swagger
 * /api/landlord/rewards:
 *   get:
 *     summary: List rewards (global + org overrides)
 *     description: Returns catalog for landlord's org. Global rewards plus org-specific overrides (org wins for same rewardId).
 *     tags: [Landlord, Rewards]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of reward items (id, rewardId, title, description, costCredits, category, status, orgId)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: No organization (landlord must be OWNER/ADMIN of an org)
 */
router.get('/', authMiddleware, normalizeRoleForRbac, requireRole(['landlord', 'admin']), getLandlordRewardsHandler);

/**
 * @swagger
 * /api/landlord/rewards:
 *   post:
 *     summary: Create org-scoped reward (override)
 *     description: Create a reward for the landlord's organization. Org scoping enforced.
 *     tags: [Landlord, Rewards]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rewardId, title, description, costCredits, category]
 *             properties:
 *               rewardId: { type: string, pattern: '^[a-z0-9-]+$' }
 *               title: { type: string }
 *               description: { type: string }
 *               costCredits: { type: integer, minimum: 0 }
 *               category: { type: string, enum: [rent credit, gift card, services] }
 *               status: { type: string, enum: [active, inactive], default: active }
 *     responses:
 *       201:
 *         description: Created reward
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: No organization
 *       409:
 *         description: rewardId already exists for this org
 */
router.post('/', authMiddleware, normalizeRoleForRbac, requireRole(['landlord', 'admin']), postLandlordRewardsHandler);

/**
 * @swagger
 * /api/landlord/rewards/{id}:
 *   patch:
 *     summary: Update org-scoped reward
 *     description: Update a reward by document id. Only rewards belonging to the landlord's org can be updated (not global).
 *     tags: [Landlord, Rewards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Reward document ObjectId
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               costCredits: { type: integer, minimum: 0 }
 *               category: { type: string, enum: [rent credit, gift card, services] }
 *               status: { type: string, enum: [active, inactive] }
 *     responses:
 *       200:
 *         description: Updated reward
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: No organization
 *       404:
 *         description: Reward not found or not owned by org
 */
router.patch('/:id', authMiddleware, normalizeRoleForRbac, requireRole(['landlord', 'admin']), patchLandlordRewardHandler);

export default router;
