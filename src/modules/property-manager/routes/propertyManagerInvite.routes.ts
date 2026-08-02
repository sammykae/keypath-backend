import { Router } from 'express';
import {
  verifyPMInviteHandler,
  sendPMInviteOtpHandler,
  verifyPMInviteOtpHandler,
  declinePMInviteHandler,
} from '../controllers/propertyManagerInvite.controller';

/**
 * Public routes (no auth) — the PM has no session yet, that's the whole
 * point of this flow. Mirrors /api/invites for tenants.
 */
const router = Router();

/**
 * @swagger
 * /api/pm-invites/verify:
 *   get:
 *     summary: Check a property-manager activation invite is still valid
 *     tags: [PropertyManager, Invites]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: "{ email, propertyName }"
 *       400:
 *         description: invalid_token | expired_token | already_accepted
 */
router.get('/verify', verifyPMInviteHandler);

/**
 * @swagger
 * /api/pm-invites/send-otp:
 *   post:
 *     summary: Email a 6-digit verification code for this invite
 *     description: Rate-limited to one send per 60 seconds.
 *     tags: [PropertyManager, Invites]
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
 *         description: "{ sent: true, email }"
 *       429:
 *         description: otp_rate_limit
 */
router.post('/send-otp', sendPMInviteOtpHandler);

/**
 * @swagger
 * /api/pm-invites/verify-otp:
 *   post:
 *     summary: Verify the OTP and activate the property manager account
 *     description: On success, activates the PM's User record and returns a JWT — no password is ever set.
 *     tags: [PropertyManager, Invites]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, otp]
 *             properties:
 *               token: { type: string }
 *               otp: { type: string }
 *     responses:
 *       200:
 *         description: "{ authToken, user }"
 *       400:
 *         description: invalid_otp | otp_expired | otp_not_sent
 */
router.post('/verify-otp', verifyPMInviteOtpHandler);

/**
 * @swagger
 * /api/pm-invites/decline:
 *   post:
 *     summary: Decline a property-manager activation invite
 *     tags: [PropertyManager, Invites]
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
 *         description: "{ declined: true }"
 *       400:
 *         description: invalid_token | already_accepted | expired_token
 */
router.post('/decline', declinePMInviteHandler);

export default router;
