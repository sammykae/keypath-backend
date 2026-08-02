import express from 'express';
import { authMiddleware } from '../../../middleware/authMiddleware';
import { getTenantDashboard, getLandlordDashboardHandler } from '../controllers/dashbardControllers';

const router = express.Router();

/**
 * @swagger
 * /api/dashboard/tenant:
 *   get:
 *     summary: Get tenant dashboard data
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tenant dashboard data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       401:
 *         description: Unauthorized
 */
router.get('/tenant', authMiddleware, getTenantDashboard);

/**
 * @swagger
 * /api/dashboard/landlord:
 *   get:
 *     summary: Get landlord dashboard data
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Landlord dashboard data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       401:
 *         description: Unauthorized
 */
router.get('/landlord', authMiddleware, getLandlordDashboardHandler);

export default router;
