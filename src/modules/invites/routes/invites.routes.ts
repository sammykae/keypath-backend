import { Router } from "express";
import { authMiddleware } from "../../../middleware/authMiddleware";
import { requireRole } from "../../../middleware/rbac.middleware";

import {
  previewInviteHandler,
  verifyInviteHandler,
  sendInviteOtpHandler,
  verifyInviteOtpHandler,
  resendInviteHandler,
  createInviteHandler,
} from "../controllers/invites.controller";

const router = Router();

/**
 * @swagger
 * /api/invites/accept:
 *   get:
 *     summary: Preview invite details from magic link token (no acceptance yet)
 *     tags: [Invites]
 *     parameters:
 *       - in: query
 *         name: token
 *         schema: { type: string }
 *         description: Magic-link token from invite email
 *     responses:
 *       200:
 *         description: Property/unit/lease summary for the invite
 *       400:
 *         description: INVITE_EXPIRED (resendInviteCta=true) or INVITE_INVALID
 *       409:
 *         description: INVITE_ALREADY_ACCEPTED
 */
router.get("/accept", previewInviteHandler);

/**
 * @swagger
 * /api/invites/verify:
 *   get:
 *     summary: Alias for GET /accept — kept for backwards compatibility
 *     tags: [Invites]
 */
router.get("/verify", verifyInviteHandler);

/**
 * @swagger
 * /api/invites/send-otp:
 *   post:
 *     summary: Email a 6-digit acceptance code to the invited tenant
 *     description: Public — the invite token is the credential. Rate limited to one send per 60 seconds.
 *     tags: [Invites]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string }
 *     responses:
 *       200:
 *         description: Code sent
 *       400:
 *         description: invalid_token / expired_token / already_accepted
 *       429:
 *         description: otp_rate_limit
 */
router.post("/send-otp", sendInviteOtpHandler);

/**
 * @swagger
 * /api/invites/verify-otp:
 *   post:
 *     summary: Accept the invite with the emailed code and return a session
 *     description: >
 *       Public — verifying the code accepts the invite, activates the tenancy and
 *       signs the tenant in. When the invited account has no password yet, one is
 *       required here and set as part of acceptance.
 *     tags: [Invites]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, otp]
 *             properties:
 *               token: { type: string }
 *               otp: { type: string, example: "123456" }
 *               password: { type: string, minLength: 8, description: "Required when the account has no password yet" }
 *     responses:
 *       200:
 *         description: Invite accepted, authToken and user returned
 *       400:
 *         description: invalid_otp / otp_expired / otp_not_sent / password_required / invalid_token / expired_token
 */
router.post("/verify-otp", verifyInviteOtpHandler);

/**
 * @swagger
 * /api/invites/resend:
 *   post:
 *     summary: Re-send the magic link invite email
 *     tags: [Invites]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inviteId: { type: string }
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: New invite link sent
 *       404:
 *         description: Invite not found
 *       409:
 *         description: Invite already accepted
 */
router.post("/resend", resendInviteHandler);

/**
 * @swagger
 * /api/invites:
 *   post:
 *     summary: Create a tenant invite (admin/landlord only)
 *     tags: [Invites]
 *     security:
 *       - bearerAuth: []
 */
router.post("/", authMiddleware, requireRole(["admin", "landlord"]), createInviteHandler);

export default router;
