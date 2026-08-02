import { Router } from 'express';
import { authMiddleware } from '../../../middleware/authMiddleware';
import { requireRole } from '../../../middleware/rbac.middleware';
import {
  resolveConfigHandler,
  listConfigsHandler,
  upsertConfigHandler,
  deleteConfigHandler,
} from '../controllers/programConfig.controller';

const router = Router();

router.use(authMiddleware);
router.use(requireRole(['landlord', 'admin']));

/**
 * @swagger
 * /api/landlord/program-config/resolve:
 *   get:
 *     summary: Effective program config for a target (with inheritance)
 *     description: >
 *       Resolves the Organization → Property → Unit → Tenant hierarchy. Pass propertyId, unitId,
 *       or tenancyId — the chain is derived automatically. Response includes provenance (which
 *       scope supplied each field; PLATFORM = default). Legacy property.participationModel acts
 *       as the PROPERTY-level programType when no PROPERTY config document exists.
 *     tags: [Landlord, ProgramConfig]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: propertyId
 *         schema: { type: string }
 *       - in: query
 *         name: unitId
 *         schema: { type: string }
 *       - in: query
 *         name: tenancyId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: "config: { programType, rewardRules, tokenRules, provenance, chain }"
 */
router.get('/resolve', resolveConfigHandler);

/**
 * @swagger
 * /api/landlord/program-config:
 *   get:
 *     summary: List program-config documents for the org
 *     tags: [Landlord, ProgramConfig]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: propertyId
 *         schema: { type: string }
 *         description: Optional — restrict to ORG scope + this property's configs
 *     responses:
 *       200:
 *         description: configs[]
 *   put:
 *     summary: Create/update a program config at one scope
 *     description: >
 *       Scopes: ORG (org-wide defaults), PROPERTY (pre-fills tenant invites), UNIT, TENANT.
 *       Unset/null fields inherit from the parent scope. Audit-logged.
 *     tags: [Landlord, ProgramConfig]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [scope]
 *             properties:
 *               scope: { type: string, enum: [ORG, PROPERTY, UNIT, TENANT] }
 *               propertyId: { type: string }
 *               unitId: { type: string }
 *               tenancyId: { type: string }
 *               programType: { type: string, enum: [NONE, RPA_ONLY, TEPA_ONLY, BOTH], nullable: true }
 *               rewardRules:
 *                 type: object
 *                 properties:
 *                   enabled: { type: boolean, nullable: true }
 *                   onTimeRentPoints: { type: number, nullable: true }
 *                   renewalPoints: { type: number, nullable: true }
 *                   maintenanceReportPoints: { type: number, nullable: true }
 *                   monthlyPointsCap: { type: number, nullable: true }
 *               tokenRules:
 *                 type: object
 *                 properties:
 *                   enabled: { type: boolean, nullable: true }
 *                   monthlyAccrualTokens: { type: number, nullable: true }
 *                   vestingMonths: { type: integer, nullable: true }
 *                   tokenValueUsd: { type: number, nullable: true }
 *               effectiveDate: { type: string, format: date-time, nullable: true }
 *     responses:
 *       200:
 *         description: Saved config document
 */
router.get('/', listConfigsHandler);
router.put('/', upsertConfigHandler);

/**
 * @swagger
 * /api/landlord/program-config/{configId}:
 *   delete:
 *     summary: Delete a config override (falls back to inherited values)
 *     tags: [Landlord, ProgramConfig]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: configId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: deleted
 */
router.delete('/:configId', deleteConfigHandler);

export default router;
