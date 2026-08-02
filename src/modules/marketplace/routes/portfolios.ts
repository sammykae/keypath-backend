import express from 'express';
import { getPortfolios } from '../controllers/portfolioController';

const router = express.Router();

/**
 * @swagger
 * /api/marketplace/portfolios:
 *   get:
 *     summary: Get all portfolios
 *     tags: [Marketplace]
 *     responses:
 *       200:
 *         description: List of portfolios
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Portfolio'
 */
router.get('/portfolios', getPortfolios);

export default router;