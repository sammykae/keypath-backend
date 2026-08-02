import { Router } from 'express';
import { authMiddleware } from '../../../middleware/authMiddleware';
import { requireRole } from '../../../middleware/rbac.middleware';
import {
  createStripePaymentIntentHandler,
  stripeWebhookHandler,
} from '../controllers/stripePayments.controller';

const router = Router();

/**
 * @swagger
 * /api/stripe/create-payment-intent:
 *   post:
 *     summary: Create Stripe PaymentIntent (tenant)
 *     description: >
 *       Resolves tenancy from JWT: if exactly one ACTIVE lease, omit **tenancyId**; multiple ACTIVE leases —
 *       send **tenancyId** so the payment attaches to the right lease/unit.
 *       **RENT**: never send **amount**. The server reads **tenancy.rentAmount** and returns **amount** in the 201
 *       JSON (same value charged on Stripe).
 *       **TOKEN_PURCHASE**: send **amount** (major currency units).
 *       STRIPE_SECRET_KEY required; **period** defaults to current UTC month when omitted.
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *             properties:
 *               amount:
 *                 type: number
 *                 format: float
 *                 description: >-
 *                   TOKEN_PURCHASE only — major currency units. Do not send for RENT (rejected).
 *               type:
 *                 type: string
 *                 enum: [RENT, TOKEN_PURCHASE]
 *               period:
 *                 type: string
 *                 pattern: '^\d{4}-(0[1-9]|1[0-2])$'
 *                 description: Billing period YYYY-MM (optional; defaults to current month)
 *               tenancyId:
 *                 type: string
 *                 description: >-
 *                   Multiple ACTIVE leases — required. Single ACTIVE lease — omit (server resolves).
 *           examples:
 *             rent_no_amount:
 *               summary: RENT — amount from tenancy
 *               description: Omit amount entirely; tenancyId only if multiple ACTIVE leases.
 *               value:
 *                 type: RENT
 *                 period: '2026-05'
 *                 tenancyId: '507f191e810c19729de860ea'
 *             token_purchase_with_amount:
 *               summary: TOKEN_PURCHASE
 *               value:
 *                 type: TOKEN_PURCHASE
 *                 amount: 50
 *           example:
 *             type: RENT
 *             period: '2026-05'
 *     responses:
 *       201:
 *         description: PaymentIntent created; body includes resolved tenancy scope and **amount** charged (lease rent for RENT)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - paymentId
 *                 - clientSecret
 *                 - stripePaymentIntentId
 *                 - tenancyId
 *                 - unitId
 *                 - propertyId
 *                 - orgId
 *                 - period
 *                 - amount
 *               properties:
 *                 paymentId:
 *                   type: string
 *                 clientSecret:
 *                   type: string
 *                 stripePaymentIntentId:
 *                   type: string
 *                 tenancyId:
 *                   type: string
 *                 unitId:
 *                   type: string
 *                 propertyId:
 *                   type: string
 *                 orgId:
 *                   type: string
 *                 period:
 *                   type: string
 *                 amount:
 *                   type: number
 *                   format: float
 *                   description: Charged amount in major currency units (from lease for RENT, or request for TOKEN_PURCHASE)
 *               example:
 *                 paymentId: 507f1f77bcf86cd799439011
 *                 clientSecret: pi_xxx_secret_xxx
 *                 stripePaymentIntentId: pi_xxxxxxxxxxxxxx
 *                 tenancyId: 507f191e810c19729de860ea
 *                 unitId: 507f191e810c19729de860eb
 *                 propertyId: 507f191e810c19729de860ec
 *                 orgId: 507f191e810c19729de860ed
 *                 period: '2026-05'
 *                 amount: 1200
 *       400:
 *         description: >-
 *           Validation: omit amount for RENT (or error if sent); amount required for TOKEN_PURCHASE —
 *           invalid tenancyId — or multiple ACTIVE tenancies without tenancyId (message asks which lease to pay).
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not tenant role)
 *       404:
 *         description: No active tenancy / unit / property for tenant
 *       409:
 *         description: Payment for this type and period already exists
 *       500:
 *         description: Stripe not configured or Stripe API error
 */
router.post('/create-payment-intent', authMiddleware, requireRole(['tenant']), createStripePaymentIntentHandler);

router.post('/webhook', stripeWebhookHandler);

export default router;
