import { Router } from "express";
import { stripeWebhookHandler } from "../controllers/stripeWebhook.controller";

const router = Router();

/**
 * @swagger
 * /api/payments/stripe/webhook:
 *   post:
 *     summary: Stripe webhook receiver
 *     description: >
 *       Handles Stripe webhook events. On payment_intent.succeeded, marks matching
 *       payment as PAID and appends ledger entry for token accounting.
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Event accepted
 *       400:
 *         description: Invalid signature
 *       404:
 *         description: Matching payment not found
 */
router.post("/webhook", stripeWebhookHandler);

export default router;
