import { NextFunction, Request, Response, Router } from 'express';
import { authMiddleware } from '../../../middleware/authMiddleware';
import { requireRole } from '../../../middleware/rbac.middleware';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import {
  getLandlordTenantParticipationHandler,
  upsertLandlordTenantParticipationHandler,
} from '../controllers/landlordTenantParticipation.controller';

const router = Router();

router.use(authMiddleware);
router.use(requireRole(['landlord', 'admin']));

const asyncH =
  (fn: (req: AuthenticatedRequest, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    void fn(req as AuthenticatedRequest, res).catch(next);
  };

/**
 * @swagger
 * /api/landlord/tenant-participation:
 *   get:
 *     summary: Get tenant participation for a tenancy (BE-202)
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenancyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Participation document or null if none
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tenantParticipation:
 *                   nullable: true
 *                   type: object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Property not in org
 *       404:
 *         description: Tenancy not found
 *   put:
 *     summary: Upsert tenant participation for a tenancy (BE-202)
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tenancyId]
 *             properties:
 *               tenancyId:
 *                 type: string
 *               tenantParticipationType:
 *                 type: string
 *                 enum: [NONE, RPA_ONLY, TEPA_ONLY, BOTH]
 *               rpaEnrollmentStatus:
 *                 type: string
 *                 enum: [PENDING, ACTIVE, DECLINED, ENDED]
 *               tepaEnrollmentStatus:
 *                 type: string
 *                 enum: [PENDING, ACTIVE, DECLINED, ENDED]
 *     responses:
 *       200:
 *         description: Saved participation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [tenantParticipation]
 *               properties:
 *                 tenantParticipation:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     tenantId: { type: string }
 *                     propertyId: { type: string }
 *                     tenancyId: { type: string }
 *                     tenantParticipationType:
 *                       type: string
 *                       enum: [NONE, RPA_ONLY, TEPA_ONLY, BOTH]
 *                     rpaEnrollmentStatus:
 *                       type: string
 *                       enum: [PENDING, ACTIVE, DECLINED, ENDED]
 *                     tepaEnrollmentStatus:
 *                       type: string
 *                       enum: [PENDING, ACTIVE, DECLINED, ENDED]
 *                     createdAt: { type: string, format: date-time }
 *                     updatedAt: { type: string, format: date-time }
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden or exceeds property allowance
 *       404:
 *         description: Tenancy or unit/property not found
 */
router.get('/', asyncH(getLandlordTenantParticipationHandler));
router.put('/', asyncH(upsertLandlordTenantParticipationHandler));

export default router;
