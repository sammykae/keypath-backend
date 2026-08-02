import { Router } from "express";
import {
  create,
  getById,
  update,
  remove,
  listByProperty,
} from "../controllers/unitController";

const router = Router();

/**
 * @swagger
 * /api/units:
 *   post:
 *     summary: Create a new unit
 *     tags: [Units]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - propertyId
 *               - unitNumber
 *               - type
 *               - bedrooms
 *               - bathrooms
 *               - sqft
 *               - marketRent
 *               - depositRequired
 *             properties:
 *               propertyId:
 *                 type: string
 *                 description: Property ObjectId
 *               unitNumber:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [apartment, flat, townhome, single_family, adu, condo]
 *               bedrooms:
 *                 type: number
 *                 minimum: 0
 *               bathrooms:
 *                 type: number
 *                 minimum: 0
 *               sqft:
 *                 type: number
 *                 minimum: 50
 *               marketRent:
 *                 type: number
 *                 minimum: 0
 *               depositRequired:
 *                 type: number
 *                 minimum: 0
 *     responses:
 *       201:
 *         description: Unit created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Unit'
 *       400:
 *         description: Validation error
 */
router.post("/", create);

/**
 * @swagger
 * /api/units/{id}:
 *   get:
 *     summary: Get unit by ID
 *     tags: [Units]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Unit ObjectId
 *     responses:
 *       200:
 *         description: Unit details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Unit'
 *       404:
 *         description: Unit not found
 */
router.get("/:id", getById);

/**
 * @swagger
 * /api/units/{id}:
 *   put:
 *     summary: Update unit by ID
 *     tags: [Units]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Unit ObjectId
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Any subset of Unit fields to update
 *     responses:
 *       200:
 *         description: Unit updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Unit'
 *       400:
 *         description: Validation error
 *       404:
 *         description: Unit not found
 */
router.put("/:id", update);

/**
 * @swagger
 * /api/units/{id}:
 *   delete:
 *     summary: Delete unit by ID
 *     tags: [Units]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Unit ObjectId
 *     responses:
 *       200:
 *         description: Unit deleted successfully
 *       404:
 *         description: Unit not found
 */
router.delete("/:id", remove);

/**
 * @swagger
 * /api/units/property/{propertyId}:
 *   get:
 *     summary: List all units for a given property
 *     tags: [Units]
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
 *       404:
 *         description: Property not found
 */
router.get("/property/:propertyId", listByProperty);

export default router;
