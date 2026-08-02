import express from "express";
import {
  create,
  getAllProperties,
  getPropertyById,
  update,
  patch,
  handleDelete,
} from "../controllers/propertyController";
import { authMiddleware } from "../../../middleware/authMiddleware";
import { adminGuard } from "../middleware/adminGuard";
import { requireRole } from "../../../middleware/rbac.middleware";
import { getPropertyActivity } from "../../activities/controllers/activityController";
import { getPropertyLoansHandler, createPropertyLoanHandler, deletePropertyLoanHandler, updatePropertyLoanHandler } from "../controllers/propertyLoans.controller";
import { normalizeRoleForRbac } from "../../tenant/middleware/normalizeRoleForRbac";

const router = express.Router();

/**
 * @swagger
 * /api/properties:
 *   post:
 *     summary: Create a new property
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orgId
 *               - name
 *               - address
 *               - type
 *             properties:
 *               orgId:
 *                 type: string
 *                 description: Organization ID (Mongo ObjectId). Optional if JWT has orgId.
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 200
 *               slug:
 *                 type: string
 *                 maxLength: 120
 *                 description: Optional unique slug
 *               address:
 *                 type: object
 *                 required: [line1, city, state, postalCode]
 *                 properties:
 *                   line1:
 *                     type: string
 *                   city:
 *                     type: string
 *                   state:
 *                     type: string
 *                     minLength: 2
 *                     maxLength: 2
 *                     description: 2-letter state code (e.g. TX)
 *                   postalCode:
 *                     type: string
 *                     minLength: 5
 *                   country:
 *                     type: string
 *                     default: US
 *               type:
 *                 type: string
 *                 enum: [SFR, MF, BTR, Condo, Other]
 *                 description: SFR=Single Family, MF=Multifamily, BTR=Build-to-Rent, Condo, Other
 *               status:
 *                 type: string
 *                 enum: [ONBOARDING, LIVE, PAUSED]
 *                 default: ONBOARDING
 *               tokenizedPct:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 100
 *                 default: 0
 *     responses:
 *       201:
 *         description: Property created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Property'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
router.post('/', authMiddleware, requireRole(['landlord', 'admin']), create);

/**
 * @swagger
 * /api/properties:
 *   get:
 *     summary: Get all properties
 *     tags: [Properties]
 *     responses:
 *       200:
 *         description: List of properties
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Property'
 */
router.get('/', getAllProperties);

/**
 * @swagger
 * /api/properties/{id}/activity:
 *   get:
 *     summary: Get activities for a specific property
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Property ObjectId
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *           default: 50
 *           maximum: 100
 *         description: Maximum number of activities to return
 *     responses:
 *       200:
 *         description: Property activities
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: number
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized
 */
// More specific route must come before /:id to avoid route conflicts
router.get('/:id/loans', authMiddleware, normalizeRoleForRbac, requireRole(['landlord', 'admin']), getPropertyLoansHandler);
router.post('/:id/loans', authMiddleware, normalizeRoleForRbac, requireRole(['landlord', 'admin']), createPropertyLoanHandler);
router.patch('/:id/loans/:loanId', authMiddleware, normalizeRoleForRbac, requireRole(['landlord', 'admin']), updatePropertyLoanHandler);
router.delete('/:id/loans/:loanId', authMiddleware, normalizeRoleForRbac, requireRole(['landlord', 'admin']), deletePropertyLoanHandler);
router.get('/:id/activity', authMiddleware, getPropertyActivity);

/**
 * @swagger
 * /api/properties/{id}:
 *   get:
 *     summary: Get property by ID
 *     tags: [Properties]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Property ObjectId
 *     responses:
 *       200:
 *         description: Property details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Property'
 *       404:
 *         description: Property not found
 */
router.get('/:id', getPropertyById);

/**
 * @swagger
 * /api/properties/{id}:
 *   put:
 *     summary: Update property by ID
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *             description: Any property fields to update
 *     responses:
 *       200:
 *         description: Property updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Property'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Property not found
 */
router.put('/:id', authMiddleware, adminGuard, update);

/**
 * @swagger
 * /api/properties/{id}:
 *   patch:
 *     summary: Partially update a property
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *             description: Any subset of property fields to update
 *     responses:
 *       200:
 *         description: Property updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Property not found
 */
router.patch('/:id', authMiddleware, adminGuard, patch);

/**
 * @swagger
 * /api/properties/{id}:
 *   delete:
 *     summary: Delete property by ID
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Property ObjectId
 *     responses:
 *       200:
 *         description: Property deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Property'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Property not found
 */
router.delete('/:id', authMiddleware, adminGuard, handleDelete);

export default router;
