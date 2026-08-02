import { Router } from 'express';
import { authMiddleware } from '../../../middleware/authMiddleware';
import { requireRole } from '../../../middleware/rbac.middleware';
import {
  registerIndependentPMHandler,
  confirmIndependentAuthorityHandler,
  createIndependentPropertyHandler,
} from '../controllers/independentPropertyManager.controller';

const router = Router();

/**
 * @swagger
 * /api/property-manager/independent/register:
 *   post:
 *     summary: Register an independent RPA-only Property Manager account (no landlord invite)
 *     description: >
 *       Path A of the Property Manager epic. Unlike a landlord-invited PM (passwordless,
 *       OTP activation), an independent PM sets their own password immediately. Creates the
 *       user, an operational Organization (same scoping a landlord's org uses — a future
 *       landlord "claim" only reassigns ownership, never migrates records), and a
 *       PropertyManagerOrganization company profile. Never grants TEPA access.
 *     tags: [PropertyManager, Onboarding]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, companyName]
 *             properties:
 *               email: { type: string }
 *               password: { type: string, minLength: 8 }
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               phone: { type: string }
 *               companyName: { type: string }
 *               companyAddress: { type: string }
 *               website: { type: string }
 *               propertiesManaged: { type: integer }
 *     responses:
 *       201:
 *         description: Registered — returns authToken/refreshToken/user/orgId
 *       409:
 *         description: Email already registered
 */
router.post('/register', registerIndependentPMHandler);

router.use(authMiddleware);
router.use(requireRole(['property_manager']));

/**
 * @swagger
 * /api/property-manager/independent/confirm-authority:
 *   post:
 *     summary: Confirm authority to administer RPA (required once, before the first property can be created)
 *     tags: [PropertyManager, Onboarding]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: confirmed + confirmedAt
 *       404:
 *         description: No independent Property Manager profile found for this account
 */
router.post('/confirm-authority', confirmIndependentAuthorityHandler);

/**
 * @swagger
 * /api/property-manager/independent/properties:
 *   post:
 *     summary: Create a property under the independent Property Manager's own authority
 *     description: >
 *       Requires confirm-authority to have already been called. Auto-assigns the PM to the new
 *       property with the full independent-RPA permission set (RPA + roster + maintenance +
 *       messaging + reporting, never TEPA). participationModel is always RPA_ONLY.
 *     tags: [PropertyManager, Onboarding]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, address, type]
 *             properties:
 *               name: { type: string }
 *               address:
 *                 type: object
 *                 required: [line1, city, state, postalCode]
 *                 properties:
 *                   line1: { type: string }
 *                   city: { type: string }
 *                   state: { type: string }
 *                   postalCode: { type: string }
 *                   country: { type: string }
 *               type: { type: string, enum: [SFR, MF, BTR, Condo, Other] }
 *               totalUnits: { type: integer }
 *               yearBuilt: { type: integer }
 *     responses:
 *       201:
 *         description: property + assignment
 *       403:
 *         description: Authority not yet confirmed
 */
router.post('/properties', createIndependentPropertyHandler);

export default router;
