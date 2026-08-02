import { Router } from "express";
import { authMiddleware } from "../../../middleware/authMiddleware";
import { requireRole } from "../../../middleware/rbac.middleware";
import {
  createRewardsCampaignHandler,
  listRewardsCampaignsHandler,
} from "../controllers/rewardsCampaigns.controller";

const router = Router();

router.use(authMiddleware);
router.use(requireRole(["landlord", "admin"]));

/**
 * @swagger
 * /api/landlord/rewards-campaigns:
 *   post:
 *     summary: Create landlord rewards campaign
 *     description: Campaigns are only allowed if RPA is enabled for the property.
 *     tags: [Rewards Campaigns]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [propertyId, goal, budget, eligibleBehaviors]
 *             properties:
 *               propertyId: { type: string }
 *               goal: { type: string }
 *               budget: { type: number }
 *               eligibleBehaviors:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [ON_TIME_RENT, MAINTENANCE_REPORTING, EARLY_RENT_PAYMENT, LEASE_RENEWAL, MAINTENANCE_REPORTED_EARLY, HVAC_FILTER_REPLACEMENT_PHOTO, MOISTURE_LEAK_CHECK_COMPLETED, SAFETY_ALERT_RESPONSE, SURVEY_COMPLETED, PAPERLESS_ENROLLMENT, COMMUNITY_PARTICIPATION, TENANT_REFERRAL, GOOD_UNIT_CARE_VERIFICATION]
 *               rewardType:
 *                 type: string
 *                 enum: [POINTS, GIFT_CARD, RENT_CREDIT, UTILITY_CREDIT, SERVICE_CREDIT, RECOGNITION_BADGE]
 *                 default: POINTS
 *               startDate: { type: string, format: date-time }
 *               endDate: { type: string, format: date-time }
 *     responses:
 *       201:
 *         description: Campaign created
 *       400:
 *         description: Validation error or RPA not enabled
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *   get:
 *     summary: List landlord rewards campaigns
 *     description: Lists campaigns scoped to your org; optionally filter by propertyId.
 *     tags: [Rewards Campaigns]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: propertyId
 *         schema: { type: string }
 *         required: false
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 200, default: 50 }
 *         required: false
 *     responses:
 *       200:
 *         description: Campaigns list
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post("/rewards-campaigns", createRewardsCampaignHandler);
router.get("/rewards-campaigns", listRewardsCampaignsHandler);

export default router;

