import express from 'express';
import { createOfferHandler, getOffersHandler} from '../controllers/offerController';

const router = express.Router();

/**
 * @swagger
 * /api/offers/create:
 *   post:
 *     summary: Create a new offer
 *     tags: [Offers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               propertyId:
 *                 type: string
 *               unitId:
 *                 type: string
 *               tenantId:
 *                 type: string
 *               amount:
 *                 type: number
 *     responses:
 *       201:
 *         description: Offer created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Offer'
 *       400:
 *         description: Validation error
 */
router.post('/create', createOfferHandler);

/**
 * @swagger
 * /api/offers:
 *   get:
 *     summary: Get all offers
 *     tags: [Offers]
 *     responses:
 *       200:
 *         description: List of offers
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Offer'
 */
router.get('/', getOffersHandler);


export default router;