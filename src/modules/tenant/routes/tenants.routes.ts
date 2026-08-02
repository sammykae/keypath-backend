import { Router } from "express";
import { getTenantPropertyHandler } from "../controllers/tenantProperty.controller";
import { getTenantDashboardHandler } from "../controllers/tenantDashboard.controller";
import { getTenantPaymentsHandler } from "../controllers/tenantPayments.controller";
import { getTenantTenanciesHandler } from "../controllers/tenantTenancies.controller";
import { redeemRewardHandler } from "../controllers/redeemReward.controller";
import { getRewardsHandler } from "../controllers/rewards.controller";
import {
  getTokenSummaryHandler,
  getTokenActivityHandler,
} from "../controllers/tokenSummary.controller";
import {
  getChallengesHandler,
  claimChallengeHandler,
  submitChallengeHandler,
  getChallengeHistoryHandler,
} from "../controllers/challenges.controller";
import { getRedemptionsHandler } from "../controllers/redemptions.controller";
import { getOwnershipCreditsHandler } from "../../ledger/controllers/ledgerController";
import { getTenantLeaderboardHandler } from "../controllers/tenantLeaderboard.controller";
import { getTenantAiSuggestionsHandler } from "../controllers/tenantAiSuggestions.controller";
import { getMaintenanceTicketsHandler, submitMaintenanceTicketHandler } from "../../maintenance/controllers/tenantMaintenance.controller";
import { maintenanceUploadHandler, maintenanceFileSignedUrlHandler } from "../../maintenance/controllers/maintenanceUpload.controller";
import {
  listMyRewardVerificationsHandler,
  submitRewardVerificationHandler,
  disputeRewardVerificationHandler,
} from "../../rewardVerifications/controllers/tenantRewardVerification.controller";
import { getMyPropertyValuationHandler } from "../../properties/controllers/valuation.controller";
import {
  listMyAgreementsHandler,
  getMyAgreementHandler,
} from "../../agreements/controllers/tenantAgreement.controller";
import { getTenantNotificationsHandler, markTenantNotificationsReadHandler } from "../controllers/tenantNotifications.controller";
import { getMyGoodStandingHandler } from "../../good-standing/controllers/goodStanding.controller";
import { getVestingSummaryHandler } from "../../ledger/controllers/vestingController";
import { uploadSingle } from "../../docs/middleware/upload.middleware";
import { authMiddleware } from "../../../middleware/authMiddleware";
import { requireRole } from "../../../middleware/rbac.middleware";
import { normalizeRoleForRbac } from "../middleware/normalizeRoleForRbac";

const router = Router();

/**
 * @swagger
 * /api/tenants/signup:
 *   post:
 *     summary: Tenant signup (DISABLED in invite-only MVP)
 *     tags: [Tenants]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fullName
 *               - email
 *               - password
 *               - employment
 *               - currentAddress
 *             properties:
 *               fullName:
 *                 type: string
 *                 description: Tenant's full name
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Tenant's email address (must be unique)
 *               phone:
 *                 type: string
 *                 description: Tenant's phone number
 *               dob:
 *                 type: string
 *                 format: date
 *                 description: Date of birth
 *               ssn:
 *                 type: string
 *                 description: Social Security Number
 *               driversLicense:
 *                 type: string
 *                 description: Driver's license number
 *               password:
 *                 type: string
 *                 description: Password for tenant account
 *               employment:
 *                 type: array
 *                 description: Employment history
 *                 items:
 *                   type: object
 *                   required:
 *                     - employerName
 *                     - position
 *                     - income
 *                     - startDate
 *                   properties:
 *                     employerName:
 *                       type: string
 *                     position:
 *                       type: string
 *                     income:
 *                       type: number
 *                     startDate:
 *                       type: string
 *                       format: date
 *                     endDate:
 *                       type: string
 *                       format: date
 *               rentalHistory:
 *                 type: array
 *                 description: Previous rental records
 *                 items:
 *                   type: object
 *                   properties:
 *                     landlordName:
 *                       type: string
 *                     landlordPhone:
 *                       type: string
 *                     address:
 *                       type: string
 *                     startDate:
 *                       type: string
 *                       format: date
 *                     endDate:
 *                       type: string
 *                       format: date
 *               currentAddress:
 *                 type: object
 *                 required:
 *                   - address1
 *                   - city
 *                   - state
 *                   - postalCode
 *                   - country
 *                 properties:
 *                   address1:
 *                     type: string
 *                   address2:
 *                     type: string
 *                   city:
 *                     type: string
 *                   state:
 *                     type: string
 *                   postalCode:
 *                     type: string
 *                   country:
 *                     type: string
 *     responses:
 *       201:
 *         description: Tenant created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Tenant'
 *       410:
 *         description: Tenant self-signup is disabled in invite-only MVP
 *       400:
 *         description: Validation error
 *       409:
 *         description: Email already exists
 */
// Invite-only MVP: public tenant signup is disabled.
router.post("/signup", (_req, res) => {
  res.status(410).json({ error: "Tenant self-signup is disabled in invite-only MVP. Use landlord/admin invites." });
});

/**
 * @swagger
 * /api/tenants/core:
 *   post:
 *     summary: Create tenant identity (BE-201)
 *     tags: [Tenants]
 *     description: Disabled in invite-only MVP. Tenant identity is created via POST /api/invites.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullName, email, source]
 *             properties:
 *               fullName:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               phone:
 *                 type: string
 *               source:
 *                 type: string
 *                 enum: [INVITE]
 *               status:
 *                 type: string
 *                 enum: [INVITED]
 *                 description: Backend derived (invite-only MVP); client should not set
 *     responses:
 *       201:
 *         description: Tenant created successfully
 *       410:
 *         description: Endpoint disabled in invite-only MVP
 *       409:
 *         description: Email already exists
 */
// BE-201 invite-only: this endpoint is auth-protected.
router.post("/core", authMiddleware, requireRole(["admin", "landlord"]), (_req, res) => {
  res.status(410).json({ error: "POST /api/tenants/core is disabled in invite-only MVP. Use POST /api/invites instead." });
});

/**
 * swagger disabled (invite-only MVP does not use this endpoint)
 * /api/tenants/core/verify-email:
 *   post:
 *     summary: Verify tenant email using token (BE-201)
 *     tags: [Tenants]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid or expired token
 */
// Email verification endpoint is not part of the invite-only MVP.

/**
 * @swagger
 * /api/tenants/dashboard:
 *   get:
 *     summary: Tenant dashboard summary (BE-100)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: range
 *         schema:
 *           type: string
 *           enum: [30d, 90d, 1y]
 *           default: 30d
 *     responses:
 *       200:
 *         description: tenant, ownershipCredits, nextPayment, activitySeries
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: TENANT only
 */
router.get("/dashboard", authMiddleware, requireRole(["tenant"]), getTenantDashboardHandler);

/**
 * @swagger
 * /api/tenants/payments:
 *   get:
 *     summary: Tenant payments list (BE-104)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: range
 *         schema:
 *           type: string
 *           default: 12m
 *     responses:
 *       200:
 *         description: payments[] (id, period, amount, status, paidAt?, method?, incentivesEarnedCredits?)
 *       401:
 *         description: Unauthorized
 */
router.get("/payments", authMiddleware, requireRole(["tenant"]), getTenantPaymentsHandler);

/**
 * @swagger
 * /api/tenants/rewards/{rewardId}/redeem:
 *   post:
 *     summary: Redeem reward (BE-103); deduct credits; idempotent
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: rewardId
 *         required: true
 *         schema:
 *           type: string
 *           example: "69997eba856a380889ef10a8"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [idempotencyKey]
 *             properties:
 *               idempotencyKey:
 *                 type: string
 *     responses:
 *       200:
 *         description: { redemptionId, remainingBalance }
 *       400:
 *         description: Insufficient balance or validation error
 *       409:
 *         description: Idempotency key reused with different payload
 */
/**
 * @swagger
 * /api/tenants/rewards/redemptions:
 *   get:
 *     summary: Tenant redemption history with fulfillment details
 *     tags: [Tenants, Tokens]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of past redemptions with reward title and fulfillment (code, credit amount, service type)
 */
router.get("/rewards/redemptions", authMiddleware, normalizeRoleForRbac, requireRole(["tenant"]), getRedemptionsHandler);
router.post("/rewards/:rewardId/redeem", authMiddleware, requireRole(["tenant"]), redeemRewardHandler);

/**
 * @swagger
 * /api/tenants/property:
 *   get:
 *     summary: Get property information for the authenticated tenant
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Property information including tenancy, unit, and property details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tenancy:
 *                   type: object
 *                 unit:
 *                   type: object
 *                 property:
 *                   type: object
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: No active tenancy found
 */
router.get("/property", authMiddleware, requireRole(["tenant"]), getTenantPropertyHandler);
router.get("/tenancies", authMiddleware, requireRole(["tenant"]), getTenantTenanciesHandler);

/**
 * @swagger
 * /api/tenants/rewards:
 *   get:
 *     summary: Get rewards catalog (tenant only)
 *     description: Returns rewards/perks for the tenant rewards page. Categories e.g. rent credit, gift card, services. Requires tenant role.
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of reward items
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           rewardId: { type: string }
 *                           title: { type: string }
 *                           description: { type: string }
 *                           costCredits: { type: number }
 *                           category: { type: string }
 *                           status: { type: string }
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not a tenant)
 */
/**
 * @swagger
 * /api/tenants/tokens/summary:
 *   get:
 *     summary: Token KPI summary for tenant tokens page
 *     description: Returns total earned, redeemed, available balance, and expiring soon counts.
 *     tags: [Tenants, Tokens]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     total: { type: number }
 *                     redeemed: { type: number }
 *                     available: { type: number }
 *                     expiringSoon: { type: number }
 */
router.get("/tokens/summary", authMiddleware, normalizeRoleForRbac, requireRole(["tenant"]), getTokenSummaryHandler);

/**
 * @swagger
 * /api/tenants/tokens/activity:
 *   get:
 *     summary: Recent token activity for tenant tokens page
 *     tags: [Tenants, Tokens]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 50 }
 *     responses:
 *       200:
 *         description: Activity items
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date: { type: string }
 *                           description: { type: string }
 *                           type: { type: string, enum: [Earned, Spent] }
 *                           tokens: { type: number }
 *                           status: { type: string, enum: [Pending, Approved] }
 */
router.get("/tokens/activity", authMiddleware, normalizeRoleForRbac, requireRole(["tenant"]), getTokenActivityHandler);

/**
 * @swagger
 * /api/tenants/challenges:
 *   get:
 *     summary: Active tenant challenges
 *     description: Returns active challenges from the tenant_challenges collection. Run npm run seed:challenges to populate.
 *     tags: [Tenants, Tokens]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Challenge list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     challenges:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           challengeId: { type: string }
 *                           title: { type: string }
 *                           description: { type: string }
 *                           rewardTokens: { type: number }
 *                           detail: { type: string }
 *                           actionLabel: { type: string }
 */
router.get("/challenges", authMiddleware, normalizeRoleForRbac, requireRole(["tenant"]), getChallengesHandler);

/**
 * @swagger
 * /api/tenants/challenges/history:
 *   get:
 *     summary: Tenant challenge participation history
 *     tags: [Tenants, Challenges]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all challenge participations for the tenant
 */
router.get("/challenges/history", authMiddleware, normalizeRoleForRbac, requireRole(["tenant"]), getChallengeHistoryHandler);

/**
 * @swagger
 * /api/tenants/challenges/{challengeId}/claim:
 *   post:
 *     summary: Claim / start a challenge
 *     tags: [Tenants, Challenges]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: challengeId
 *         required: true
 *         schema: { type: string }
 *         description: Challenge document ObjectId
 *     responses:
 *       201:
 *         description: Participation created (status IN_PROGRESS or APPROVED for auto-verified)
 *       409:
 *         description: Already claimed
 */
router.post("/challenges/:challengeId/claim", authMiddleware, normalizeRoleForRbac, requireRole(["tenant"]), claimChallengeHandler);

/**
 * @swagger
 * /api/tenants/challenges/{challengeId}/submit:
 *   post:
 *     summary: Submit proof for a manual-verification challenge
 *     tags: [Tenants, Challenges]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: challengeId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               proofUrl:
 *                 type: string
 *                 description: S3 URL of uploaded proof image/document
 *     responses:
 *       200:
 *         description: Status updated to PENDING_REVIEW
 */
router.post("/challenges/:challengeId/submit", authMiddleware, normalizeRoleForRbac, requireRole(["tenant"]), submitChallengeHandler);

router.get("/rewards", authMiddleware, normalizeRoleForRbac, requireRole(['tenant']), getRewardsHandler);

/**
 * @swagger
 * /api/tenants/ownership-credits:
 *   get:
 *     summary: Tenant reward / ownership credits history (BE-101, BE-204)
 *     description: Returns aggregated credit balance and paginated credit events. Unified ledger rows add eventType, timestamp, propertyId, unitId when present.
 *     tags: [Tenants, Ledger]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Pagination cursor (ObjectId of the last event from the previous page)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 25
 *         description: Page size
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [EARN, REDEEM, ADJUST, EXPIRE]
 *         description: Filter by mapped event type (optional)
 *     responses:
 *       200:
 *         description: Balance and event history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [balance, events, nextCursor]
 *               properties:
 *                 balance:
 *                   type: number
 *                   description: Sum of balances across all credit accounts for this tenant
 *                   example: 1250
 *                 nextCursor:
 *                   type: string
 *                   nullable: true
 *                   description: Pass as cursor for the next page, or null if no more pages
 *                 events:
 *                   type: array
 *                   items:
 *                     type: object
 *                     required: [id, type, amount, occurredAt]
 *                     properties:
 *                       id:
 *                         type: string
 *                         description: Event id (credit event ObjectId)
 *                       type:
 *                         type: string
 *                         enum: [EARN, REDEEM, ADJUST, EXPIRE]
 *                         description: API-facing event category
 *                       amount:
 *                         type: number
 *                         description: Absolute amount for display
 *                       occurredAt:
 *                         type: string
 *                         format: date-time
 *                       description:
 *                         type: string
 *                       referenceId:
 *                         type: string
 *                       ledgerKind:
 *                         type: string
 *                         enum: [REWARD]
 *                         description: Present when unified ledger row exists (BE-204)
 *                       eventType:
 *                         type: string
 *                         description: Business event type from unified ledger (e.g. LANDLORD_CREDIT_EARN)
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                         description: Canonical time from unified ledger (often same as occurredAt)
 *                       propertyId:
 *                         type: string
 *                       unitId:
 *                         type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not a tenant)
 */
router.get(
  "/ownership-credits",
  authMiddleware,
  normalizeRoleForRbac,
  requireRole(["tenant"]),
  getOwnershipCreditsHandler
);

router.get(
  "/leaderboard",
  authMiddleware,
  normalizeRoleForRbac,
  requireRole(["tenant"]),
  getTenantLeaderboardHandler
);

router.get(
  "/ai-suggestions",
  authMiddleware,
  normalizeRoleForRbac,
  requireRole(["tenant"]),
  getTenantAiSuggestionsHandler
);

/**
 * @swagger
 * /api/tenants/maintenance:
 *   get:
 *     summary: Get tenant's maintenance tickets
 *     tags: [Tenants, Maintenance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of maintenance tickets for the authenticated tenant
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     tickets:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           title:
 *                             type: string
 *                           description:
 *                             type: string
 *                           severity:
 *                             type: string
 *                             enum: [LOW, MEDIUM, HIGH]
 *                           status:
 *                             type: string
 *                             enum: [OPEN, IN_PROGRESS, RESOLVED, CLOSED]
 *                           creditsAwarded:
 *                             type: number
 *                           resolvedAt:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not a tenant)
 */
router.get("/maintenance", authMiddleware, normalizeRoleForRbac, requireRole(["tenant"]), getMaintenanceTicketsHandler);

/**
 * @swagger
 * /api/tenants/maintenance:
 *   post:
 *     summary: Submit a new maintenance request
 *     tags: [Tenants, Maintenance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tenancyId, title]
 *             properties:
 *               tenancyId:
 *                 type: string
 *                 description: ID of the tenancy (from GET /api/tenants/tenancies)
 *                 example: "64abc123def456"
 *               title:
 *                 type: string
 *                 example: Leaking faucet
 *               description:
 *                 type: string
 *                 example: Small leak under the kitchen sink
 *               issueType:
 *                 type: string
 *                 enum: [PLUMBING, HVAC, APPLIANCE, MOISTURE, ELECTRICAL, GENERAL]
 *                 default: GENERAL
 *               severity:
 *                 type: string
 *                 enum: [LOW, MEDIUM, HIGH]
 *                 default: LOW
 *     responses:
 *       201:
 *         description: Maintenance ticket created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     ticket:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         title:
 *                           type: string
 *                         description:
 *                           type: string
 *                         severity:
 *                           type: string
 *                           enum: [LOW, MEDIUM, HIGH]
 *                         status:
 *                           type: string
 *                           enum: [OPEN]
 *                         creditsAwarded:
 *                           type: number
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Validation error or no active tenancy
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not a tenant)
 *       404:
 *         description: No active tenancy found
 */
router.post("/maintenance", authMiddleware, normalizeRoleForRbac, requireRole(["tenant"]), submitMaintenanceTicketHandler);
router.post("/maintenance/upload", authMiddleware, normalizeRoleForRbac, requireRole(["tenant"]), uploadSingle, maintenanceUploadHandler);
router.get("/maintenance/file", authMiddleware, normalizeRoleForRbac, requireRole(["tenant", "landlord", "admin"]), maintenanceFileSignedUrlHandler);

/**
 * @swagger
 * /api/tenants/rewards/verifications:
 *   get:
 *     summary: List the tenant's own RPA reward verification history
 *     tags: [Tenant, Rewards]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: verifications[]
 *   post:
 *     summary: Submit a reward verification (proof of an eligible behavior)
 *     description: >
 *       Always issues RewardType points/credits (never a TEPA ownership token) once approved.
 *       If the landlord/PM had already marked this tenant ELIGIBLE for the same
 *       property+behavior(+campaign), that row transitions to SUBMITTED instead of creating a new one.
 *     tags: [Tenant, Rewards]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [propertyId, eligibleBehavior]
 *             properties:
 *               propertyId: { type: string }
 *               unitId: { type: string }
 *               campaignId: { type: string }
 *               eligibleBehavior:
 *                 type: string
 *                 enum: [ON_TIME_RENT, MAINTENANCE_REPORTING, EARLY_RENT_PAYMENT, LEASE_RENEWAL, MAINTENANCE_REPORTED_EARLY, HVAC_FILTER_REPLACEMENT_PHOTO, MOISTURE_LEAK_CHECK_COMPLETED, SAFETY_ALERT_RESPONSE, SURVEY_COMPLETED, PAPERLESS_ENROLLMENT, COMMUNITY_PARTICIPATION, TENANT_REFERRAL, GOOD_UNIT_CARE_VERIFICATION]
 *               rewardType:
 *                 type: string
 *                 enum: [POINTS, GIFT_CARD, RENT_CREDIT, UTILITY_CREDIT, SERVICE_CREDIT, RECOGNITION_BADGE]
 *               proofNote: { type: string }
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     fileKey: { type: string }
 *                     fileName: { type: string }
 *                     fileType: { type: string }
 *     responses:
 *       201:
 *         description: Created verification (status SUBMITTED)
 *       403:
 *         description: No active tenancy at this property
 */
router.get("/rewards/verifications", authMiddleware, normalizeRoleForRbac, requireRole(["tenant"]), listMyRewardVerificationsHandler);
router.post("/rewards/verifications", authMiddleware, normalizeRoleForRbac, requireRole(["tenant"]), submitRewardVerificationHandler);

/**
 * @swagger
 * /api/tenants/rewards/verifications/{id}/dispute:
 *   post:
 *     summary: Dispute a denied reward verification
 *     tags: [Tenant, Rewards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [disputeReason]
 *             properties:
 *               disputeReason: { type: string }
 *     responses:
 *       200:
 *         description: Updated verification (status DISPUTED)
 *       400:
 *         description: Only a denied reward can be disputed
 */
router.post("/rewards/verifications/:id/dispute", authMiddleware, normalizeRoleForRbac, requireRole(["tenant"]), disputeRewardVerificationHandler);

/**
 * @swagger
 * /api/tenants/tepa/valuation:
 *   get:
 *     summary: Annual valuation status for the tenant's property
 *     description: Backs the "Annual Valuation Date" / status field on the tenant TEPA card.
 *     tags: [Tenant, TEPA]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "{ status, latest, nextDueDate }"
 *       404:
 *         description: No active tenancy found
 */
router.get("/tepa/valuation", authMiddleware, normalizeRoleForRbac, requireRole(["tenant"]), getMyPropertyValuationHandler);

/**
 * @swagger
 * /api/tenants/agreements:
 *   get:
 *     summary: List the tenant's Lease/RPA/TEPA agreements (TEPA only if applicable to their participation model)
 *     tags: [Tenant, Agreements]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: agreements[]
 */
router.get("/agreements", authMiddleware, normalizeRoleForRbac, requireRole(["tenant"]), listMyAgreementsHandler);

/**
 * @swagger
 * /api/tenants/agreements/{agreementId}:
 *   get:
 *     summary: View/download one of the tenant's own agreements
 *     description: Auto-transitions SENT -> VIEWED, recording viewedAt.
 *     tags: [Tenant, Agreements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: agreementId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Agreement detail, including a signed document URL if uploaded
 */
router.get("/agreements/:agreementId", authMiddleware, normalizeRoleForRbac, requireRole(["tenant"]), getMyAgreementHandler);

/**
 * @swagger
 * /api/tenants/notifications:
 *   get:
 *     summary: Get tenant notifications
 *     tags: [Tenant]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of notifications with unread count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 notifications:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       title:
 *                         type: string
 *                       icon:
 *                         type: string
 *                         enum: [bell, user, building, alert, check, payment, message]
 *                       action:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                       relativeTime:
 *                         type: string
 *                       isRead:
 *                         type: boolean
 *                 unreadCount:
 *                   type: integer
 */
router.get("/notifications", authMiddleware, normalizeRoleForRbac, requireRole(["tenant"]), getTenantNotificationsHandler);

/**
 * @swagger
 * /api/tenants/notifications/mark-read:
 *   post:
 *     summary: Mark all tenant notifications as read
 *     tags: [Tenant]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notifications marked as read
 */
router.post("/notifications/mark-read", authMiddleware, normalizeRoleForRbac, requireRole(["tenant"]), markTenantNotificationsReadHandler);

/**
 * @swagger
 * /api/tenants/good-standing:
 *   get:
 *     summary: Tenant's own Good Standing status
 *     description: Auto-computed from rent arrears, tenancy status, and landlord flags. Shows status (ACTIVE/AT_RISK/PAUSED/SUSPENDED), reasons, and reward/token eligibility.
 *     tags: [Tenants, GoodStanding]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: standing object
 *       404:
 *         description: No active tenancy
 */
router.get("/good-standing", authMiddleware, normalizeRoleForRbac, requireRole(["tenant"]), getMyGoodStandingHandler);

/**
 * @swagger
 * /api/tenants/tokens/vesting:
 *   get:
 *     summary: Tenant token vesting summary (TEPA)
 *     description: Total / Vested / Unvested tokens computed from the token ledger using the resolved program config (monthly accrual, vesting months, token value). Includes next vesting date.
 *     tags: [Tenants, Tokens]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "vesting: { totalTokens, vestedTokens, unvestedTokens, tokenValueUsd, monthlyAccrualTokens, vestingMonths, nextVestingDate }"
 *       404:
 *         description: No active tenancy
 */
router.get("/tokens/vesting", authMiddleware, normalizeRoleForRbac, requireRole(["tenant"]), getVestingSummaryHandler);

export default router;
