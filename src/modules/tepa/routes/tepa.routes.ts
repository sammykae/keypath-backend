import { Router } from 'express';
import passport from 'passport';
import { tepaOptIn } from '../controllers/tepa.controller';
import { validateRequest } from '../../../middleware/validate.middleware';
import { tepaOptInSchema } from '../validators/tepa.validators';

const router = Router();

// Codex: TEPA endpoint docs now include exact payload and envelope responses.
/**
 * @openapi
 * /api/tenant/programs/tepa/opt-in:
 *   post:
 *     tags:
 *       - TEPA
 *     summary: Tenant TEPA opt-in
 *     description: >
 *       Tenant opts into TEPA program with consent tracking.
 *       Only one active enrollment per tenancy is allowed.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TepaOptInRequest'
 *     responses:
 *       201:
 *         description: TEPA opt-in successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TepaEnrollmentResponse'
 *       400:
 *         description: Validation or payload error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       409:
 *         description: TEPA already active
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.post(
  '/tenant/programs/tepa/opt-in',
  passport.authenticate('jwt', { session: false }),
  validateRequest(tepaOptInSchema),
  tepaOptIn
);

export default router;
