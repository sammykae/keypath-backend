import { Router } from "express";
import { authMiddleware } from "../../../middleware/authMiddleware";
import { requireRole } from "../../../middleware/rbac.middleware";

import {
  previewInviteHandler,
  confirmAcceptInviteHandler,
  verifyInviteHandler,
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
 * /api/invites/accept:
 *   post:
 *     summary: Confirm acceptance via magic link — returns auth JWT
 *     tags: [Invites]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string, description: "Magic link token from invite email" }
 *     responses:
 *       200:
 *         description: Accepted — returns authToken, dashboardRoute, and user
 *       400:
 *         description: INVITE_EXPIRED or INVITE_INVALID
 *       409:
 *         description: INVITE_ALREADY_ACCEPTED
 */
router.post("/accept", confirmAcceptInviteHandler);

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
