import { Router } from 'express';
import { authMiddleware } from '../../../middleware/authMiddleware';
import { requireRole } from '../../../middleware/rbac.middleware';
import { getCapTableHandler, recalculateCapTableHandler } from '../controllers/capTable.controller';

const router = Router();

// Cap table exposes ownership %, investor allocations, and token totals —
// landlord capital-structure information. property_manager must never see
// this (Laurel, Property Manager epic §2.3/§8) — org Membership alone (which
// every assigned PM has) is not sufficient authorization, role must be checked.
router.use(authMiddleware, requireRole(['landlord', 'admin']));

/**
 * @swagger
 * /api/cap-table/recalculate:
 *   post:
 *     summary: Recalculate and persist cap table (BE-310)
 *     tags: [CapTable]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [propertyId]
 *             properties:
 *               propertyId:
 *                 type: string
 *               expectedLedgerTotal:
 *                 type: number
 *                 description: Optional; mismatch adds TOKEN_MISMATCH warning
 *     responses:
 *       200:
 *         description: Cap table snapshot saved
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Property not found
 */
router.post('/recalculate', recalculateCapTableHandler);

/**
 * @swagger
 * /api/cap-table/{propertyId}:
 *   get:
 *     summary: Get live cap table from token ledger (BE-310)
 *     tags: [CapTable]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Cap table (ledger-consistent)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Property not found
 */
router.get('/:propertyId', getCapTableHandler);

export default router;
