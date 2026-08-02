import { Router } from "express";
import { issueCreditsHandler } from "../controllers/ledgerController";
import { authMiddleware } from "../../../middleware/authMiddleware";

const router = Router();

/**
 * @swagger
 * /api/landlord/credits/issue:
 *   post:
 *     summary: Issue credits to a tenant (EARN or ADJUST)
 *     description: >
 *       Landlord or admin issues ownership credits to a tenant. Creates a credit event and audit log.
 *       Tenant must have an active tenancy in the organization. Requires orgId or propertyId for scope.
 *     tags: [Ledger, Landlord]
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
 *               - amount
 *               - reason
 *               - idempotencyKey
 *             properties:
 *               tenantUserId:
 *                 type: string
 *                 description: Tenant user ObjectId
 *               amount:
 *                 type: number
 *                 minimum: 0
 *                 exclusiveMinimum: true
 *               reason:
 *                 type: string
 *               propertyId:
 *                 type: string
 *                 description: Optional; used to resolve org and optionally scope tenancy
 *               unitId:
 *                 type: string
 *                 description: Optional unit scope for the credit account
 *               idempotencyKey:
 *                 type: string
 *                 description: Unique key for idempotent writes
 *               type:
 *                 type: string
 *                 enum: [EARN, ADJUST]
 *                 default: EARN
 *               orgId:
 *                 type: string
 *                 description: Optional; required if propertyId not provided
 *     responses:
 *       201:
 *         description: Credits issued successfully
 *       400:
 *         description: Validation error or orgId/propertyId required
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions or tenant not in org
 *       404:
 *         description: Property not found
 *       409:
 *         description: Idempotency key conflict
 */
router.post("/issue", authMiddleware, issueCreditsHandler);

export default router;
