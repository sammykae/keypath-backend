import { Router } from 'express';
import passport from 'passport';
import { seedDemoData } from '../controllers/demo-seed.controllers';
import {
  createDemoRequestHandler,
  listDemoRequestsHandler,
  updateDemoRequestStatusHandler,
} from '../controllers/demo-request.controller';
import { validateRequest } from '../../../middleware/validate.middleware';
import { createDemoRequestSchema } from '../dto/demo-request.dto';
import { authMiddleware } from '../../../middleware/authMiddleware';
import { requireRole } from '../../../middleware/rbac.middleware';

const router = Router();

/**
 * @openapi
 * /api/request-demo:
 *   post:
 *     tags:
 *       - Public
 *     summary: Submit a demo request
 *     description: Public endpoint to submit a website demo request.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - email
 *               - phoneNumber
 *               - titleOrRole
 *               - companyOrOrganization
 *               - interestedAs
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               email: { type: string, format: email }
 *               phoneNumber: { type: string, example: '+15551234567' }
 *               titleOrRole: { type: string }
 *               companyOrOrganization: { type: string }
 *               interestedAs: { type: string, example: 'Landlord / Property Owner' }
 *               inquiryNotes: { type: string }
 *     responses:
 *       201:
 *         description: Demo request saved
 *       400:
 *         description: Validation error
 *       500:
 *         description: Internal server error
 */
router.post(
  '/request-demo',
  validateRequest(createDemoRequestSchema),
  createDemoRequestHandler
);

// Codex: explicit Admin demo-seeding docs for BE-901 operations.
/**
 * @openapi
 * /api/admin/demo/seed:
 *   post:
 *     tags:
 *       - Admin
 *     summary: Seed demo data (DEMO_MODE only)
 *     description: >
 *       Seeds safe demo data for dashboards and onboarding.
 *       Only works when DEMO_MODE=true.
 *       Admin only.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Demo data seeded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DemoSeedResponse'
 *       403:
 *         description: Forbidden or DEMO_MODE disabled
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.post(
  '/admin/demo/seed',
  passport.authenticate('jwt', { session: false }),
  seedDemoData
);

router.get(
  '/admin/demo-requests',
  authMiddleware,
  requireRole(['admin']),
  listDemoRequestsHandler
);

router.patch(
  '/admin/demo-requests/:id/status',
  authMiddleware,
  requireRole(['admin']),
  updateDemoRequestStatusHandler
);

export default router;
