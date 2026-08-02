import { Router } from 'express';
import { authMiddleware } from '../../../middleware/authMiddleware';
import { requireRole } from '../../../middleware/rbac.middleware';
import {
  submitLiquidityRequestHandler,
  getMyLiquidityRequestsHandler,
  cancelLiquidityRequestHandler,
  listLiquidityRequestsHandler,
  reviewLiquidityRequestHandler,
  addDeductionHandler,
  setRofrDecisionHandler,
  setTransferStatusHandler,
} from '../controllers/liquidity.controller';

/* -------------------------------------------------------------------------- */
/*  Tenant-facing — mounted at /api/tenants/liquidity                         */
/* -------------------------------------------------------------------------- */

const tenantRouter = Router();
tenantRouter.use(authMiddleware);
tenantRouter.use(requireRole(['tenant']));

/**
 * @swagger
 * /api/tenants/liquidity:
 *   get:
 *     summary: My liquidity requests
 *     tags: [Tenants, Liquidity]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: requests[]
 *   post:
 *     summary: Submit a liquidity request (record-and-track only — no on-platform payment)
 *     description: Requested tokens must not exceed the tenant's currently vested token balance.
 *     tags: [Tenants, Liquidity]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tokens]
 *             properties:
 *               tokens: { type: number }
 *     responses:
 *       201:
 *         description: Created request (status SUBMITTED)
 *       400:
 *         description: Requested tokens exceed vested balance
 */
tenantRouter.get('/', getMyLiquidityRequestsHandler);
tenantRouter.post('/', submitLiquidityRequestHandler);

/**
 * @swagger
 * /api/tenants/liquidity/{requestId}:
 *   delete:
 *     summary: Cancel my liquidity request (only while SUBMITTED or UNDER_REVIEW)
 *     tags: [Tenants, Liquidity]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Cancelled request
 */
tenantRouter.delete('/:requestId', cancelLiquidityRequestHandler);

/* -------------------------------------------------------------------------- */
/*  Landlord-facing — mounted at /api/landlord/liquidity                      */
/* -------------------------------------------------------------------------- */

const landlordRouter = Router();
landlordRouter.use(authMiddleware);
landlordRouter.use(requireRole(['landlord', 'admin']));

/**
 * @swagger
 * /api/landlord/liquidity:
 *   get:
 *     summary: List liquidity requests for the org
 *     tags: [Landlord, Liquidity]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [SUBMITTED, UNDER_REVIEW, APPROVED, DENIED, CANCELLED, COMPLETED]
 *     responses:
 *       200:
 *         description: requests[]
 */
landlordRouter.get('/', listLiquidityRequestsHandler);

/**
 * @swagger
 * /api/landlord/liquidity/{requestId}/review:
 *   patch:
 *     summary: Move a request to UNDER_REVIEW / APPROVED / DENIED
 *     description: Approving sets rofrDecision=PENDING with a response deadline (default 30 days).
 *     tags: [Landlord, Liquidity]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [UNDER_REVIEW, APPROVED, DENIED] }
 *               note: { type: string }
 *     responses:
 *       200:
 *         description: Updated request
 */
landlordRouter.patch('/:requestId/review', reviewLiquidityRequestHandler);

/**
 * @swagger
 * /api/landlord/liquidity/{requestId}/deductions:
 *   post:
 *     summary: Add an approved deduction (only on an APPROVED request, before transfer completes)
 *     tags: [Landlord, Liquidity]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amountTokens, reason]
 *             properties:
 *               amountTokens: { type: number }
 *               reason: { type: string }
 *     responses:
 *       201:
 *         description: Updated request
 */
landlordRouter.post('/:requestId/deductions', addDeductionHandler);

/**
 * @swagger
 * /api/landlord/liquidity/{requestId}/rofr:
 *   patch:
 *     summary: Record the landlord's right-of-first-refusal decision
 *     tags: [Landlord, Liquidity]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [decision]
 *             properties:
 *               decision: { type: string, enum: [WAIVED, EXERCISED] }
 *               note: { type: string }
 *     responses:
 *       200:
 *         description: Updated request
 */
landlordRouter.patch('/:requestId/rofr', setRofrDecisionHandler);

/**
 * @swagger
 * /api/landlord/liquidity/{requestId}/transfer:
 *   patch:
 *     summary: Update the off-platform transfer status
 *     description: >
 *       Completing the transfer (status=COMPLETED) finalizes the request and writes token-ledger
 *       entries for the approved deductions and the net payout, reducing the tenant's vested
 *       balance. Requires the ROFR decision to be resolved first.
 *     tags: [Landlord, Liquidity]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [PENDING, COMPLETED] }
 *               note: { type: string }
 *     responses:
 *       200:
 *         description: Updated request
 */
landlordRouter.patch('/:requestId/transfer', setTransferStatusHandler);

export { tenantRouter as liquidityTenantRoutes, landlordRouter as liquidityLandlordRoutes };
