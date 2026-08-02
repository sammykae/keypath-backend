import { Router } from "express";
import { authMiddleware } from "../../../middleware/authMiddleware";
import { requireRole } from "../../../middleware/rbac.middleware";
import {
  exportOccupiedUnitsParticipationCsvHandler,
  getOccupiedUnitsParticipationHandler,
} from "../controllers/participationResolution.controller";

const router = Router();

/**
 * @swagger
 * /api/participation/occupied-units:
 *   get:
 *     summary: Resolve occupied-unit participation (RPA/TEPA/BOTH)
 *     description: >
 *       Returns occupied units (ACTIVE tenancies) and each occupied tenant's participation state.
 *       Provide exactly one query param: propertyId | unitId | tenancyId | tenantId.
 *     tags: [Participation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: propertyId
 *         schema: { type: string }
 *         required: false
 *       - in: query
 *         name: unitId
 *         schema: { type: string }
 *         required: false
 *       - in: query
 *         name: tenancyId
 *         schema: { type: string }
 *         required: false
 *       - in: query
 *         name: tenantId
 *         schema: { type: string }
 *         required: false
 *     responses:
 *       200:
 *         description: Occupied-unit participation rows
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       unit:
 *                         type: object
 *                         properties:
 *                           unitId: { type: string }
 *                           unitNumber: { type: string, nullable: true }
 *                           propertyId: { type: string }
 *                           unitStatus: { type: string }
 *                           leaseStart: { type: string, nullable: true }
 *                           leaseEnd: { type: string, nullable: true }
 *                       tenant:
 *                         type: object
 *                         properties:
 *                           tenantUserId: { type: string }
 *                           email: { type: string, nullable: true }
 *                           name: { type: string, nullable: true }
 *                       participationType:
 *                         type: string
 *                         enum: [RPA, TEPA, BOTH, NONE]
 *                       rewardsEligibility: { type: boolean }
 *                       tepaEligibility: { type: boolean }
 *       400:
 *         description: Validation error (missing/extra query params)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get(
  "/participation/occupied-units",
  authMiddleware,
  requireRole(["landlord", "admin"]),
  getOccupiedUnitsParticipationHandler
);

/**
 * @swagger
 * /api/participation/occupied-units/export:
 *   get:
 *     summary: Export occupied-unit participation (CSV)
 *     description: >
 *       Same resolution as /api/participation/occupied-units, returned as a CSV download.
 *       Provide exactly one query param: propertyId | unitId | tenancyId | tenantId.
 *     tags: [Participation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: propertyId
 *         schema: { type: string }
 *         required: false
 *       - in: query
 *         name: unitId
 *         schema: { type: string }
 *         required: false
 *       - in: query
 *         name: tenancyId
 *         schema: { type: string }
 *         required: false
 *       - in: query
 *         name: tenantId
 *         schema: { type: string }
 *         required: false
 *     responses:
 *       200:
 *         description: CSV file
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       400:
 *         description: Validation error (missing/extra query params)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get(
  "/participation/occupied-units/export",
  authMiddleware,
  requireRole(["landlord", "admin"]),
  exportOccupiedUnitsParticipationCsvHandler
);

export default router;

