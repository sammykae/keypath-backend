import { Router } from "express";
import {
  createLandlordUnit,
  listLandlordUnits,
  updateLandlordUnit,
  deleteLandlordUnit
} from "../controllers/landlordUnitController";
import { authMiddleware } from "../../../middleware/authMiddleware";

const router = Router();

/**
 * @swagger
 * /api/landlord/properties/{propertyId}/units:
 *   post:
 *     summary: Create a new unit for a property
 *     tags: [Landlord Units]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *         description: Property ObjectId
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - unitNumber
 *               - bedrooms
 *               - bathrooms
 *               - rent
 *             properties:
 *               unitNumber:
 *                 type: string
 *                 description: Unit number/identifier
 *               bedrooms:
 *                 type: number
 *                 minimum: 0
 *               bathrooms:
 *                 type: number
 *                 minimum: 0
 *               rent:
 *                 type: number
 *                 minimum: 0
 *               status:
 *                 type: string
 *                 enum: [VACANT, OCCUPIED, TURN, OFFLINE]
 *                 default: VACANT
 *     responses:
 *       201:
 *         description: Unit created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Property does not belong to user's organization
 *       404:
 *         description: Property not found
 */
router.post("/properties/:propertyId/units", authMiddleware, createLandlordUnit);

/**
 * @swagger
 * /api/landlord/properties/{propertyId}/units:
 *   get:
 *     summary: List all units for a property
 *     tags: [Landlord Units]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *         description: Property ObjectId
 *     responses:
 *       200:
 *         description: List of units
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Unit'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Property does not belong to user's organization
 *       404:
 *         description: Property not found
 */
router.get("/properties/:propertyId/units", authMiddleware, listLandlordUnits);
router.patch("/properties/:propertyId/units/:unitId", authMiddleware, updateLandlordUnit);
router.delete("/properties/:propertyId/units/:unitId", authMiddleware, deleteLandlordUnit);

export default router;
