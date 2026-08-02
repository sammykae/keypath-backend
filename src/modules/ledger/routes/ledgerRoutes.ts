import { Router } from "express";
import {
  findOrCreateAccountHandler,
  createCreditEventHandler,
  getAccountBalanceHandler,
  listUnifiedLedgerEntriesHandler,
  reconcileUnifiedLedgerHandler,
  createTokenLedgerEntryHandler,
  getTenantLedgerHandler,
  getPropertyLedgerHandler,
} from "../controllers/ledgerController";
import { authMiddleware } from "../../../middleware/authMiddleware";
import { requireRole } from "../../../middleware/rbac.middleware";
import { normalizeRoleForRbac } from "../../tenant/middleware/normalizeRoleForRbac";

const router = Router();

/**
 * @swagger
 * /api/ledger/accounts:
 *   post:
 *     summary: Find or create a credit account for the authenticated user
 *     description: Returns existing account or creates one. Use the returned accountId when posting credit events.
 *     tags: [Ledger]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               orgId:
 *                 type: string
 *                 description: Optional organization ObjectId
 *               unitId:
 *                 type: string
 *                 description: Optional unit ObjectId
 *     responses:
 *       200:
 *         description: Credit account (existing or newly created)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accountId:
 *                   type: string
 *                 tenantUserId:
 *                   type: string
 *                 orgId:
 *                   type: string
 *                   nullable: true
 *                 unitId:
 *                   type: string
 *                   nullable: true
 *       401:
 *         description: Unauthorized
 */
router.post("/accounts", authMiddleware, findOrCreateAccountHandler);

/**
 * @swagger
 * /api/ledger/events:
 *   post:
 *     summary: Create a credit event (append-only ledger write)
 *     tags: [Ledger]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountId
 *               - type
 *               - amount
 *               - idempotencyKey
 *             properties:
 *               accountId:
 *                 type: string
 *                 description: Credit account ObjectId
 *               type:
 *                 type: string
 *                 enum: [CREDIT, DEBIT, ADJUSTMENT, EXPIRATION, TRANSFER_OUT, TRANSFER_IN, REDEMPTION, REFUND]
 *               amount:
 *                 type: number
 *                 minimum: 0
 *               occurredAt:
 *                 type: string
 *                 format: date-time
 *               description:
 *                 type: string
 *               idempotencyKey:
 *                 type: string
 *                 description: Unique key to ensure idempotent writes
 *     responses:
 *       201:
 *         description: Credit event created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Credit account not found
 *       409:
 *         description: Idempotency key conflict
 */
router.post("/events", authMiddleware, createCreditEventHandler);

/**
 * @swagger
 * /api/ledger/entry:
 *   post:
 *     summary: Create token ledger entry
 *     tags: [Ledger]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - property_id
 *               - tenant_id
 *               - type
 *               - tokens
 *               - source
 *             properties:
 *               property_id:
 *                 type: string
 *                 description: Property ObjectId
 *               tenant_id:
 *                 type: string
 *                 description: Tenant User ObjectId
 *               type:
 *                 type: string
 *                 enum: [accrual, purchase, adjustment, forfeit, vesting, valuation_update, liquidity_request, approved_deduction, correction, transfer_request, spot_purchase, incentive_token, vested_token_payment_right]
 *               tokens:
 *                 type: number
 *                 description: Token delta (+/-) for this event
 *               value:
 *                 type: number
 *                 description: Optional fiat value attached to event
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *               source:
 *                 type: string
 *                 description: Event origin
 *     responses:
 *       201:
 *         description: Ledger entry created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: TEPA guard violation (not good standing / eviction freeze)
 *       404:
 *         description: Property not found
 *       409:
 *         description: Duplicate entry detected
 */
// Landlord/admin only — this endpoint accepts an arbitrary token delta for any
// tenant/property with no other authorization check, so it must never be
// reachable by a tenant (previously it was: authMiddleware only, no role gate).
router.post("/entry", authMiddleware, normalizeRoleForRbac, requireRole(["landlord", "admin"]), createTokenLedgerEntryHandler);

/**
 * @swagger
 * /api/ledger/property/{id}:
 *   get:
 *     summary: Get property token ledger history
 *     tags: [Ledger]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: ledgerKind
 *         schema:
 *           type: string
 *           enum: [REWARD, OWNERSHIP]
 *         description: Optional filter; omit to return both kinds
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Pagination cursor (ObjectId of the last entry from the previous page)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 25
 *         description: Page size
 *     responses:
 *       200:
 *         description: Unified ledger page
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [entries, nextCursor]
 *               properties:
 *                 nextCursor:
 *                   type: string
 *                   nullable: true
 *                   description: Pass as cursor for next page, or null if end
 *                 entries:
 *                   type: array
 *                   items:
 *                     type: object
 *                     required: [id, ledgerKind, eventType, timestamp, signedAmount]
 *                     properties:
 *                       id: { type: string }
 *                       ledgerKind:
 *                         type: string
 *                         enum: [REWARD, OWNERSHIP]
 *                       eventType: { type: string, description: Business event type }
 *                       timestamp: { type: string, format: date-time }
 *                       signedAmount:
 *                         type: number
 *                         description: Signed delta (positive adds, negative subtracts for balance reconstruction)
 *                       propertyId: { type: string }
 *                       unitId: { type: string }
 *                       orgId: { type: string }
 *                       description: { type: string }
 *                       creditEventId: { type: string, description: Present for REWARD rows linked to CreditEvent }
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (tenant role required)
 */
router.get(
  "/unified/entries",
  authMiddleware,
  normalizeRoleForRbac,
  requireRole(["tenant"]),
  listUnifiedLedgerEntriesHandler
);

/**
 * @swagger
 * /api/ledger/unified/reconcile:
 *   get:
 *     summary: Reconcile unified REWARD ledger sum vs credit balances (BE-210)
 *     description: Compares sum of REWARD signedAmount in UnifiedLedgerEntry to computed credit balance; includes per-property OWNERSHIP totals. Tenant role only.
 *     tags: [Ledger]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reconciliation snapshot
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - rewardBalanceFromLedger
 *                 - rewardBalanceFromCredits
 *                 - rewardMatch
 *                 - ownershipByProperty
 *               properties:
 *                 rewardBalanceFromLedger:
 *                   type: number
 *                   description: Sum of signedAmount for REWARD entries for this tenant
 *                 rewardBalanceFromCredits:
 *                   type: number
 *                   description: Sum of balances across credit accounts
 *                 rewardMatch:
 *                   type: boolean
 *                   description: True if ledger sum matches credit balance (within epsilon)
 *                 ownershipByProperty:
 *                   type: object
 *                   additionalProperties:
 *                     type: number
 *                   description: Property ObjectId string keys to net OWNERSHIP signedAmount
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (tenant role required)
 */
router.get(
  "/unified/reconcile",
  authMiddleware,
  normalizeRoleForRbac,
  requireRole(["tenant"]),
  reconcileUnifiedLedgerHandler
);

router.get("/property/:id", authMiddleware, getPropertyLedgerHandler);

/**
 * @swagger
 * /api/ledger/{tenant_id}:
 *   get:
 *     summary: Get tenant token ledger history
 *     tags: [Ledger]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenant_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant User ObjectId
 *     responses:
 *       200:
 *         description: Tenant ledger entries and derived balance
 *       400:
 *         description: Invalid tenant id
 *       401:
 *         description: Unauthorized
 */
router.get("/:tenant_id", authMiddleware, getTenantLedgerHandler);

export default router;
