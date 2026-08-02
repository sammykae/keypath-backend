import { Router } from "express";
import { createTenancyHandler } from "../controllers/tenancyController";
import { authMiddleware } from "../../../middleware/authMiddleware";

const router = Router();

/**
 * @swagger
 * /api/landlord/tenancies:
 *   post:
 *     summary: Create a new tenancy
 *     tags: [Tenancies]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tenantUserId
 *               - unitId
 *               - leaseStart
 *               - leaseEnd
 *               - rentAmount
 *             properties:
 *               tenantUserId:
 *                 type: string
 *                 description: Tenant user ObjectId
 *               unitId:
 *                 type: string
 *                 description: Unit ObjectId
 *               leaseStart:
 *                 type: string
 *                 format: date
 *               leaseEnd:
 *                 type: string
 *                 format: date
 *               rentAmount:
 *                 type: number
 *                 minimum: 0
 *     responses:
 *       201:
 *         description: Tenancy created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Tenant user or unit not found
 *       409:
 *         description: Unit already has an active tenancy
 */
router.post("/", authMiddleware, createTenancyHandler);

export default router;
