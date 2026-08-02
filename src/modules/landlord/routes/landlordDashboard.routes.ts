import { Router } from 'express';
import { authMiddleware } from '../../../middleware/authMiddleware';
import { requireRole } from '../../../middleware/rbac.middleware';
import { getLandlordDashboardHandler } from '../controllers/landlordDashboard.controller';
import { getLandlordMaintenanceHandler, updateMaintenanceTicketHandler } from '../../maintenance/controllers/landlordMaintenance.controller';
import { maintenanceFileSignedUrlHandler, maintenanceUploadHandler } from '../../maintenance/controllers/maintenanceUpload.controller';
import { uploadSingle } from '../../docs/middleware/upload.middleware';
import {
  listRewardVerificationsHandler,
  markEligibleHandler,
  startReviewHandler,
  reviewRewardVerificationHandler,
  resolveDisputeHandler,
} from '../../rewardVerifications/controllers/landlordRewardVerification.controller';
import {
  recordValuationHandler,
  listValuationsHandler,
} from '../../properties/controllers/valuation.controller';
import {
  getTenantTEPASummaryForLandlordHandler,
  getTenantTokenLedgerForLandlordHandler,
} from '../../ledger/controllers/landlordTepaView.controller';
import {
  listAgreementsHandler,
  uploadSignedAgreementHandler,
  updateAgreementStatusHandler,
  getAgreementFileHandler,
} from '../../agreements/controllers/landlordAgreement.controller';
import { agreementUploadHandler } from '../../agreements/controllers/agreementUpload.controller';
import {
  listComplianceDocumentsHandler,
  getComplianceSummaryHandler,
  uploadComplianceDocumentHandler,
  updateComplianceStatusHandler,
  getComplianceDocumentFileHandler,
} from '../../compliance/controllers/landlordCompliance.controller';
import { complianceUploadHandler } from '../../compliance/controllers/complianceUpload.controller';
import {
  listLandlordPropertiesHandler,
  getLandlordPropertyDetailHandler,
} from '../controllers/landlordProperties.controller';
import { listLandlordTenantsHandler } from '../controllers/landlordTenants.controller';
import {
  inviteTenantHandler,
  removeTenantHandler,
  setTepaOptInHandler,
  resendTenantInviteHandler,
  adjustTenantRewardsHandler
} from '../controllers/landlordTenantActions.controller';
import { getLandlordFinancesHandler } from '../controllers/landlordFinances.controller';
import { getLandlordNotificationsHandler, getLandlordAiSuggestionsHandler, markNotificationsReadHandler } from '../controllers/landlordNotifications.controller';
import { getLandlordProgramHandler, pauseTokenizationHandler, resumeTokenizationHandler } from '../controllers/landlordProgram.controller';
import { getLandlordValuationHandler } from '../controllers/landlordValuation.controller';
import { getLandlordReportsHandler } from '../controllers/landlordReports.controller';
import {
  getLandlordReportKpisHandler,
  listReportUnitsByStatusHandler,
} from '../controllers/landlordReportsKpi.controller';
import { getLandlordComplianceHandler } from '../controllers/landlordCompliance.controller';
import { updateComplianceDocStatusHandler } from '../controllers/landlordComplianceUpdate.controller';
import { listPropertyUnitsHandler } from '../controllers/landlordUnits.controller';
import { uploadPropertyImageHandler } from '../controllers/landlordPropertyImage.controller';
import { updateLandlordPropertyHandler, deleteLandlordPropertyHandler } from '../controllers/landlordPropertyCrud.controller';
import { uploadImageFile } from '../../docs/middleware/upload.middleware';
import { incentivesRunHandler } from '../controllers/incentivesRun.controller';
import { createRewardHandler, listLandlordRewardsHandler } from '../../rewards/controllers/reward.controller';
import { patchLandlordRewardHandler } from '../../landlord-rewards/controllers/landlordRewards.controller';
import {
  createCampaignHandler,
  listCampaignsHandler,
  updateCampaignHandler,
} from '../../campaign/controllers/campaign.controller';
import {
  listFinancingHandler,
  createFinancingHandler,
  deleteFinancingHandler,
} from '../controllers/landlordFinancing.controller';
import { getLandlordInvestorsHandler } from '../controllers/landlordInvestors.controller';
import { upsertUnitFinancialsHandler } from '../controllers/landlordUnitFinancials.controller';
import { getLandlordDebtHandler } from '../controllers/landlordDebt.controller';
import {
  listLandlordChallengesHandler,
  createLandlordChallengeHandler,
  patchLandlordChallengeHandler,
  deleteLandlordChallengeHandler,
  listChallengeParticipationsHandler,
  reviewParticipationHandler,
} from '../controllers/landlordChallenges.controller';
import {
  listPendingRedemptionsHandler,
  reviewRedemptionHandler,
} from '../controllers/landlordRedemptionApproval.controller';
import {
  getChatSettingsHandler,
  updateChatSettingsHandler,
} from '../controllers/landlordChatSettings.controller';
import { runMonthlyAccrualHandler } from '../../ledger/controllers/vestingController';

const router = Router();

router.use(authMiddleware);
router.use(requireRole(['landlord', 'admin']));

/**
 * @swagger
 * /api/landlord/dashboard:
 *   get:
 *     summary: Landlord dashboard
 *     description: Portfolio counts, credits summary, occupancy/credits trends. Org-scoped.
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: range
 *         schema:
 *           type: string
 *           default: 12m
 *         description: Time range (e.g. 12m, 6m)
 *     responses:
 *       200:
 *         description: portfolio, creditsSummary, alerts, occupancyTrend, creditsTrend
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: No landlord org found
 */
router.get('/dashboard', getLandlordDashboardHandler);

/**
 * @swagger
 * /api/landlord/finances:
 *   get:
 *     summary: Landlord finances — property-consistent monthly operating detail
 *     description: Returns the same property list as /dashboard. Defaults to current month.
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *           example: "2026-05"
 *         description: YYYY-MM (defaults to current month)
 *     responses:
 *       200:
 *         description: month, totals, properties[]
 *       401:
 *         description: Unauthorized
 */
router.get('/finances', getLandlordFinancesHandler);
router.get('/notifications', getLandlordNotificationsHandler);
router.post('/notifications/mark-read', markNotificationsReadHandler);

/**
 * @swagger
 * /api/landlord/ai-suggestions:
 *   get:
 *     summary: Rules-based portfolio suggestions (P2 — AI Suggestions Based on Real Landlord Portfolio Data)
 *     description: >
 *       Deterministic rules over real portfolio data — never random, never an LLM call.
 *       Each suggestion's `text` contains only numbers present in its own `sourceData`,
 *       and `reason` explains the "why am I seeing this?" basis. Categories map to the
 *       ticket's 8 focus areas: REVENUE, VACANCY, RENEWAL_RISK, MAINTENANCE_CAPEX,
 *       TENANT_AT_RISK, LATE_RENT, RETENTION, OPERATING_PERFORMANCE, plus a GENERAL
 *       empty-state/fallback. Org-scoped.
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "{ suggestions: Array<{ text, type, reason, sourceData }> }"
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: No landlord org found
 */
router.get('/ai-suggestions', getLandlordAiSuggestionsHandler);

/**
 * @swagger
 * /api/landlord/properties:
 *   get:
 *     summary: List properties
 *     description: Search, filter, paginate. Org-scoped.
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 25
 *     responses:
 *       200:
 *         description: properties[], nextCursor
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: No landlord org found
 */
router.get('/properties', listLandlordPropertiesHandler);

/**
 * @swagger
 * /api/landlord/properties/{propertyId}:
 *   get:
 *     summary: Property detail
 *     description: Units, tenant count, program config.
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Property with units, tenant count
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Property not found
 */
router.get('/properties/:propertyId', getLandlordPropertyDetailHandler);

/**
 * @swagger
 * /api/landlord/properties/{propertyId}/program:
 *   get:
 *     summary: Property program details (rewards and tokenization)
 *     description: Fetch rewards campaign and tokenization config data
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Program data with rewards and equity info
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get('/properties/:propertyId/program', getLandlordProgramHandler);

/**
 * @swagger
 * /api/landlord/properties/{propertyId}/tokenization/pause:
 *   post:
 *     summary: Pause tokenization for a property
 *     description: Stop tenant accrual temporarily
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tokenization paused
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Property not found
 */
router.get('/properties/:propertyId/valuation', getLandlordValuationHandler);

/**
 * @swagger
 * /api/landlord/properties/{propertyId}/valuations:
 *   get:
 *     summary: Annual valuation history + status for a property
 *     description: >
 *       Distinct from GET .../valuation (a single derived current estimate) — this is the
 *       recorded valuation history (method, source, effective date) plus a due/overdue status,
 *       backing "Annual Valuation Date/Status" on the tenant and landlord TEPA cards.
 *     tags: [Landlord, TEPA]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: "{ history[], status, latest, nextDueDate }"
 *   post:
 *     summary: Record a new (typically annual) property valuation
 *     description: Updates Property.valuationUsd and writes a zero-token VALUATION_UPDATE ledger entry for every active tenant on the property.
 *     tags: [Landlord, TEPA]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [valuationUsd, method]
 *             properties:
 *               valuationUsd: { type: number }
 *               method: { type: string, enum: [APPRAISAL, BPO, AVM] }
 *               source: { type: string, enum: [MANUAL, ZILLOW, REDFIN, CORELOGIC, OTHER], default: MANUAL }
 *               effectiveDate: { type: string, format: date-time }
 *               notes: { type: string }
 *     responses:
 *       201:
 *         description: Created valuation snapshot
 */
router.get('/properties/:propertyId/valuations', listValuationsHandler);
router.post('/properties/:propertyId/valuations', recordValuationHandler);

/**
 * @swagger
 * /api/landlord/tepa/tenants/{tenantUserId}:
 *   get:
 *     summary: TEPA vesting summary for a specific tenant in the landlord's org
 *     description: Previously only a Property Manager (via TEPA_VIEW) could see this — the landlord had no equivalent endpoint at all.
 *     tags: [Landlord, TEPA]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantUserId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Vesting summary (totalTokens, vestedTokens, unvestedTokens, tokenValueUsd, ...)
 *       403:
 *         description: Tenant is not on a property in your organization
 */
router.get('/tepa/tenants/:tenantUserId', getTenantTEPASummaryForLandlordHandler);

/**
 * @swagger
 * /api/landlord/tepa/tenants/{tenantUserId}/ledger:
 *   get:
 *     summary: Token ledger entries for a specific tenant in the landlord's org
 *     tags: [Landlord, TEPA]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantUserId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: propertyId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: "{ entries[], balance }"
 */
router.get('/tepa/tenants/:tenantUserId/ledger', getTenantTokenLedgerForLandlordHandler);

/**
 * @swagger
 * /api/landlord/agreements:
 *   get:
 *     summary: Agreement (Lease/RPA/TEPA) status across the org — which tenants have signed, which haven't
 *     tags: [Landlord, Agreements]
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
 *         name: tenantUserId
 *         schema: { type: string }
 *       - in: query
 *         name: agreementType
 *         schema: { type: string, enum: [LEASE, RPA, TEPA] }
 *     responses:
 *       200:
 *         description: agreements[] (each row includes tenantName, tenantEmail, propertyName, unitNumber, status, signedAt, effectiveDate)
 */
router.get('/agreements', authMiddleware, requireRole(['landlord', 'admin']), listAgreementsHandler);

/**
 * @swagger
 * /api/landlord/agreements/upload:
 *   post:
 *     summary: Upload a signed agreement file
 *     description: Returns fileKey/fileName/fileType — pass into POST /agreements/upload-signed.
 *     tags: [Landlord, Agreements]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: "{ fileKey, fileName, fileType }"
 */
router.post('/agreements/upload', authMiddleware, requireRole(['landlord', 'admin']), uploadSingle, agreementUploadHandler);

/**
 * @swagger
 * /api/landlord/agreements/upload-signed:
 *   post:
 *     summary: Attach a signed document to a tenant's Lease/RPA/TEPA agreement
 *     description: Sets status to SIGNED (or ACTIVE if effectiveDate has already arrived). Creates the agreement row if one doesn't exist yet.
 *     tags: [Landlord, Agreements]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tenantUserId, propertyId, unitId, agreementType, document]
 *             properties:
 *               tenantUserId: { type: string }
 *               propertyId: { type: string }
 *               unitId: { type: string }
 *               agreementType: { type: string, enum: [LEASE, RPA, TEPA] }
 *               document:
 *                 type: object
 *                 properties:
 *                   fileKey: { type: string }
 *                   fileName: { type: string }
 *                   fileType: { type: string }
 *               effectiveDate: { type: string, format: date-time }
 *               signedAt: { type: string, format: date-time }
 *     responses:
 *       201:
 *         description: Created/updated agreement
 */
router.post('/agreements/upload-signed', authMiddleware, requireRole(['landlord', 'admin']), uploadSignedAgreementHandler);

/**
 * @swagger
 * /api/landlord/agreements/{agreementId}/status:
 *   patch:
 *     summary: Manually transition an agreement's status (SENT or TERMINATED)
 *     tags: [Landlord, Agreements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: agreementId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [SENT, TERMINATED] }
 *     responses:
 *       200:
 *         description: Updated agreement
 */
router.patch('/agreements/:agreementId/status', authMiddleware, requireRole(['landlord', 'admin']), updateAgreementStatusHandler);

/**
 * @swagger
 * /api/landlord/agreements/{agreementId}/file:
 *   get:
 *     summary: Get a signed URL for the uploaded agreement document
 *     tags: [Landlord, Agreements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: agreementId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: "{ url, fileName }"
 *       404:
 *         description: No document uploaded for this agreement
 */
router.get('/agreements/:agreementId/file', authMiddleware, requireRole(['landlord', 'admin']), getAgreementFileHandler);

/**
 * @swagger
 * /api/landlord/compliance-documents:
 *   get:
 *     summary: Compliance Center — status of all 10 required document types across the org
 *     description: Lease/RPA/TEPA rows are per active tenant; the other 7 types are property-wide. Missing rows are lazily created so every required type always has a real record.
 *     tags: [Landlord, Compliance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: propertyId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [MISSING, UPLOADED, PENDING_REVIEW, APPROVED, REJECTED, EXPIRED] }
 *       - in: query
 *         name: documentType
 *         schema: { type: string, enum: [LEASE_AGREEMENT, RPA_AGREEMENT, TEPA_AGREEMENT, INSPECTION_REPORT, RENTAL_LICENSE, PROPERTY_INSURANCE, MORTGAGE_DEBT_DOCUMENT, PROPERTY_TAX_DOCUMENT, CITY_LICENSING_DOCUMENT, OTHER_SUPPORTING_DOCUMENT] }
 *     responses:
 *       200:
 *         description: documents[] (each includes viewUrl — null means "click to upload", non-null means "click to view")
 */
router.get('/compliance-documents', authMiddleware, requireRole(['landlord', 'admin']), listComplianceDocumentsHandler);

/**
 * @swagger
 * /api/landlord/compliance-documents/summary:
 *   get:
 *     summary: Compliance status aggregation — counts by status, org-wide or for one property
 *     tags: [Landlord, Compliance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: propertyId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: "{ totalDocuments, byStatus: { MISSING, UPLOADED, PENDING_REVIEW, APPROVED, REJECTED, EXPIRED } }"
 */
router.get('/compliance-documents/summary', authMiddleware, requireRole(['landlord', 'admin']), getComplianceSummaryHandler);

/**
 * @swagger
 * /api/landlord/compliance-documents/upload:
 *   post:
 *     summary: Upload a compliance document file
 *     description: Returns fileKey/fileName/fileType — pass into POST /compliance-documents/upload-complete.
 *     tags: [Landlord, Compliance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: "{ fileKey, fileName, fileType }"
 */
router.post('/compliance-documents/upload', authMiddleware, requireRole(['landlord', 'admin']), uploadSingle, complianceUploadHandler);

/**
 * @swagger
 * /api/landlord/compliance-documents/upload-complete:
 *   post:
 *     summary: Attach an uploaded file to a compliance document record
 *     description: Sets status to UPLOADED. Lease/RPA/TEPA require tenantId; the other 7 types are property-wide.
 *     tags: [Landlord, Compliance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [propertyId, documentType, document]
 *             properties:
 *               propertyId: { type: string }
 *               tenantId: { type: string }
 *               documentType: { type: string }
 *               document:
 *                 type: object
 *                 properties:
 *                   fileKey: { type: string }
 *                   fileName: { type: string }
 *                   fileType: { type: string }
 *               expiresAt: { type: string, format: date-time }
 *     responses:
 *       201:
 *         description: Created/updated compliance document (status UPLOADED)
 */
router.post('/compliance-documents/upload-complete', authMiddleware, requireRole(['landlord', 'admin']), uploadComplianceDocumentHandler);

/**
 * @swagger
 * /api/landlord/compliance-documents/{id}/status:
 *   patch:
 *     summary: Review a compliance document (Pending Review / Approved / Rejected / Expired)
 *     tags: [Landlord, Compliance]
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
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [PENDING_REVIEW, APPROVED, REJECTED, EXPIRED] }
 *               rejectionReason: { type: string }
 *               expiresAt: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Updated compliance document
 *       400:
 *         description: rejectionReason is required when rejecting
 */
router.patch('/compliance-documents/:id/status', authMiddleware, requireRole(['landlord', 'admin']), updateComplianceStatusHandler);

/**
 * @swagger
 * /api/landlord/compliance-documents/{id}/file:
 *   get:
 *     summary: Get a signed URL for an uploaded compliance document
 *     tags: [Landlord, Compliance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: "{ url, fileName }"
 *       404:
 *         description: No document uploaded for this record
 */
router.get('/compliance-documents/:id/file', authMiddleware, requireRole(['landlord', 'admin']), getComplianceDocumentFileHandler);

router.post('/properties/:propertyId/tokenization/pause', pauseTokenizationHandler);

/**
 * @swagger
 * /api/landlord/properties/{propertyId}/tokenization/resume:
 *   post:
 *     summary: Resume tokenization for a property
 *     description: Resume tenant accrual
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tokenization resumed
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Property not found
 */
router.post('/properties/:propertyId/tokenization/resume', resumeTokenizationHandler);

/**
 * @swagger
 * /api/landlord/tenants:
 *   get:
 *     summary: List tenants
 *     description: Org-scoped, safe projections. Filter by propertyId, status.
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: propertyId
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 25
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [leaseEnd, arrearsDays]
 *         description: leaseEnd = lease months remaining; arrearsDays = days late. Both are joined/derived fields, so when set, cursor-based pagination is disabled and up to 500 matching tenants are sorted and truncated to `limit` server-side (nextCursor is always null in this mode).
 *       - in: query
 *         name: sortDir
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: asc
 *     responses:
 *       200:
 *         description: tenants[], nextCursor
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: No landlord org found
 */
router.get('/tenants', listLandlordTenantsHandler);

/**
 * @swagger
 * /api/landlord/tenants/invite:
 *   post:
 *     summary: Invite a tenant to a unit
 *     description: Creates a tenancy for an existing or new user. Returns an onboarding invite URL.
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [unitId, email, rentAmount, leaseStart, leaseEnd]
 *             properties:
 *               unitId:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               rentAmount:
 *                 type: number
 *               leaseStart:
 *                 type: string
 *                 format: date
 *               leaseEnd:
 *                 type: string
 *                 format: date
 *     responses:
 *       201:
 *         description: Tenancy created, invite URL returned
 *       400:
 *         description: Validation error
 *       403:
 *         description: Unit not in landlord org
 *       409:
 *         description: Unit already has an active tenant
 */
router.post('/tenants/invite', inviteTenantHandler);

/**
 * @swagger
 * /api/landlord/tenants/{tenantUserId}:
 *   delete:
 *     summary: Remove a tenant (terminate tenancy)
 *     description: Sets the tenant's active tenancy status to TERMINATED and writes an audit event.
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantUserId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tenancy terminated
 *       403:
 *         description: Tenant not in landlord org
 *       404:
 *         description: Active tenancy not found
 */
router.delete('/tenants/:tenantUserId', removeTenantHandler);

/**
 * @swagger
 * /api/landlord/tenants/{tenantUserId}/tepa:
 *   patch:
 *     summary: Enable or disable TEPA opt-in for a tenant
 *     description: Sets tepaOptInStatus to OPTED_IN or OPTED_OUT on the tenant's active tenancy.
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantUserId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [enabled]
 *             properties:
 *               enabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: TEPA status updated
 *       400:
 *         description: Validation error
 *       403:
 *         description: Tenant not in landlord org
 *       404:
 *         description: Active tenancy not found
 */
router.patch('/tenants/:tenantUserId/tepa', setTepaOptInHandler);

/**
 * @swagger
 * /api/landlord/tenants/{tenantUserId}/resend-invite:
 *   post:
 *     summary: Resend onboarding invite email to a tenant
 *     description: Sends a new invite email to the tenant. Returns sent:false (not an error) if SMTP is not configured.
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantUserId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invite sent (or sent:false with reason if SMTP not configured)
 *       403:
 *         description: Tenant not in landlord org
 *       404:
 *         description: Active tenancy or user not found
 */
router.post('/tenants/:tenantUserId/resend-invite', resendTenantInviteHandler);

/**
 * @swagger
 * /api/landlord/tenants/{tenantUserId}/rewards:
 *   post:
 *     summary: Adjust rewards (credits) for a tenant
 *     description: Issues a credit ADJUST ledger entry for the tenant. Writes an audit event.
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantUserId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, reason]
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Number of credits to add
 *               reason:
 *                 type: string
 *                 description: Reason or campaign name
 *     responses:
 *       201:
 *         description: Reward adjustment recorded
 *       400:
 *         description: Validation error
 *       403:
 *         description: Tenant not in landlord org
 *       404:
 *         description: Active tenancy not found
 */
router.post('/tenants/:tenantUserId/rewards', adjustTenantRewardsHandler);

/**
 * @swagger
 * /api/landlord/incentives/run:
 *   post:
 *     summary: Run incentives
 *     description: Dry run or execute. Issues credits to tenants for ON_TIME_RENT, RENEWAL, REFERRAL. Stub implementation.
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dryRun
 *         schema:
 *           type: boolean
 *           default: true
 *         description: true = preview only, false = execute
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ruleType, period]
 *             properties:
 *               ruleType:
 *                 type: string
 *                 enum: [ON_TIME_RENT, RENEWAL, REFERRAL]
 *               period:
 *                 type: string
 *                 example: "2026-02"
 *                 description: YYYY-MM
 *     responses:
 *       200:
 *         description: Incentives run result (wouldIssue/issued, message)
 *       400:
 *         description: Validation error (ruleType, period required)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: No landlord org found
 */
router.post('/incentives/run', incentivesRunHandler);

/**
 * @swagger
 * /api/landlord/reports:
 *   get:
 *     summary: Portfolio reports summary
 *     description: Returns portfolio, participation, tokenization, credits, compliance, and property breakdown. Org-scoped.
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: portfolio, participation, tokenization, credits, compliance, propertyBreakdown
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: No landlord org found
 */
router.get('/reports', getLandlordReportsHandler);

/**
 * @swagger
 * /api/landlord/reports/kpis:
 *   get:
 *     summary: Reports page KPIs (P2 — Occupancy, NOI/Expenses, Lease Exposure, Tenant Participation, Rewards Budget vs Spent, Debt Maturity Ladder, Portfolio Summary)
 *     description: Consolidated, time-filterable JSON payload for the landlord Reports page charts. Org-scoped. investorOwnerMix is always null — no named-investor entity exists in this product.
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: range
 *         schema:
 *           type: string
 *           enum: [30d, 90d, 1y, last30days, last90days, thisyear]
 *         description: Time filter — Last 30 Days, Last 90 Days, or This Year. Defaults to This Year.
 *     responses:
 *       200:
 *         description: occupancy, noiExpenses, leaseExposure, tenantParticipation, rewardsBudget, debtMaturityLadder, portfolioSummary, investorOwnerMix
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: No landlord org found
 */
router.get('/reports/kpis', getLandlordReportKpisHandler);

/**
 * @swagger
 * /api/landlord/reports/units:
 *   get:
 *     summary: Org-wide unit list filtered by status (drilldown for clicking an Occupancy chart segment)
 *     description: Unlike GET /api/landlord/properties/{propertyId}/units, this is not scoped to one property — it returns every matching unit across the landlord's whole org.
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         required: true
 *         schema:
 *           type: string
 *           enum: [VACANT, OCCUPIED, TURN, OFFLINE]
 *     responses:
 *       200:
 *         description: List of units matching the given status
 *       400:
 *         description: Invalid or missing status
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: No landlord org found
 */
router.get('/reports/units', listReportUnitsByStatusHandler);

/**
 * @swagger
 * /api/landlord/compliance:
 *   get:
 *     summary: Compliance document status per property
 *     description: Returns required documents (RPA/TEPA) and their upload/review status for each property. Org-scoped.
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: summary (compliant/needsReview/actionRequired counts), properties[] with documents[]
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: No landlord org found
 */
router.get('/compliance', getLandlordComplianceHandler);
router.patch('/compliance/documents/:docId/status', updateComplianceDocStatusHandler);

/**
 * @swagger
 * /api/landlord/properties/{propertyId}/units:
 *   get:
 *     summary: List units for a property
 *     description: Returns all units with occupancy status and current tenant info. Org-scoped.
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: units[], total
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Property not found
 */
router.get('/properties/:propertyId/units', listPropertyUnitsHandler);

/**
 * @swagger
 * /api/landlord/properties/{propertyId}/image:
 *   post:
 *     summary: Upload a cover image for a property
 *     tags: [Landlord, Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Image uploaded, returns public URL
 *       400:
 *         description: Missing file or invalid type
 *       404:
 *         description: Property not found
 */
router.post('/properties/:propertyId/image', uploadImageFile, uploadPropertyImageHandler);

/**
 * @swagger
 * /api/landlord/properties/{propertyId}:
 *   patch:
 *     summary: Update own property (name, type, address)
 *     tags: [Landlord, Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               type: { type: string, enum: [SFR, MF, BTR, Condo, Other] }
 *               address: { type: object }
 *     responses:
 *       200:
 *         description: Property updated
 *       404:
 *         description: Property not found
 */
router.patch('/properties/:propertyId', updateLandlordPropertyHandler);

/**
 * @swagger
 * /api/landlord/properties/{propertyId}:
 *   delete:
 *     summary: Delete own property (blocked if active tenants exist)
 *     tags: [Landlord, Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Property deleted
 *       409:
 *         description: Cannot delete — active tenants exist
 */
router.delete('/properties/:propertyId', deleteLandlordPropertyHandler);

/**
 * @swagger
 * /api/landlord/rewards:
 *   post:
 *     summary: Create reward (org-scoped)
 *     tags: [Landlord, Rewards]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, creditCost]
 *             properties:
 *               name:
 *                 type: string
 *                 description: Reward name
 *               creditCost:
 *                 type: integer
 *                 minimum: 0
 *                 description: Credits required to redeem
 *               orgId:
 *                 type: string
 *                 nullable: true
 *                 description: Optional; null for global reward (admin only)
 *     responses:
 *       201:
 *         description: Reward created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: No landlord org found
 */
router.post('/rewards', createRewardHandler);
router.patch('/rewards/:id', patchLandlordRewardHandler);

/**
 * @swagger
 * /api/landlord/rewards:
 *   get:
 *     summary: List rewards (org + global)
 *     tags: [Landlord, Rewards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Pagination cursor
 *     responses:
 *       200:
 *         description: { rewards: [...], nextCursor? }
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: No landlord org found
 */
router.get('/rewards', listLandlordRewardsHandler);

/**
 * @swagger
 * /api/landlord/campaigns:
 *   post:
 *     summary: Create event-triggered rewards campaign (BE-205)
 *     description: >
 *       Creates an org-scoped campaign. When triggerEvent fires (e.g. new tenancy or rent marked PAID),
 *       matching ACTIVE campaigns append CREDIT rows to the ledger (idempotent per campaign + correlation id).
 *     tags: [Landlord, Campaigns]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CampaignCreateBody'
 *           example:
 *             orgId: '507f1f77bcf86cd799439011'
 *             name: Move-in bonus
 *             triggerEvent: TENANCY_CREATED
 *             creditAmount: 200
 *             goal: Reward on-time rent and renewals
 *             budgetUsd: 5000
 *             budgetTokenCap: 25000
 *     responses:
 *       201:
 *         description: Campaign created (includes metrics + display blocks)
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: No landlord org found
 *   get:
 *     summary: List campaigns for landlord org
 *     description: Returns all campaigns for the given org after verifying the user belongs to that org.
 *     tags: [Landlord, Campaigns]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization Mongo ObjectId (must be OWNER or ADMIN)
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 campaigns:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Public campaign DTO (id, statusLabel, metrics, display, etc.)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: No landlord org found
 */
router.post('/campaigns', createCampaignHandler);
router.get('/campaigns', listCampaignsHandler);

router.get('/investors', getLandlordInvestorsHandler);
router.get('/debt', getLandlordDebtHandler);
router.post('/units/:unitId/financials', upsertUnitFinancialsHandler);
router.get('/properties/:propertyId/financing', listFinancingHandler);
router.post('/properties/:propertyId/financing', createFinancingHandler);
router.delete('/properties/:propertyId/financing/:financingId', deleteFinancingHandler);
/**
 * @swagger
 * /api/landlord/campaigns/{id}:
 *   patch:
 *     summary: Update campaign (status, amounts, scope)
 *     description: Partial update; send at least one field. Use null to clear optional fields.
 *     tags: [Landlord, Campaigns]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Campaign Mongo ObjectId
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CampaignPatchBody'
 *           example:
 *             orgId: '507f1f77bcf86cd799439011'
 *             status: ENDED
 *     responses:
 *       200:
 *         description: Updated campaign (includes metrics + display)
 *       400:
 *         description: Validation error (e.g. empty body, invalid dates)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: No landlord org or not campaign owner
 *       404:
 *         description: Campaign not found
 */
router.patch('/campaigns/:id', updateCampaignHandler);

/**
 * @swagger
 * /api/landlord/maintenance:
 *   get:
 *     summary: List all maintenance tickets for landlord's properties
 *     tags: [Landlord, Maintenance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [OPEN, UNDER_REVIEW, IN_PROGRESS, RESOLVED, REJECTED, CLOSED]
 *     responses:
 *       200:
 *         description: List of maintenance tickets with tenant info (includes issueType, statusLabel, rewardEligible, rewardDecision)
 */
router.get('/maintenance', authMiddleware, requireRole(['landlord', 'admin']), getLandlordMaintenanceHandler);

/**
 * @swagger
 * /api/landlord/maintenance/{ticketId}:
 *   patch:
 *     summary: Update maintenance ticket status and optionally award credits
 *     tags: [Landlord, Maintenance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [OPEN, UNDER_REVIEW, IN_PROGRESS, RESOLVED, REJECTED, CLOSED]
 *               creditsToAward:
 *                 type: number
 *                 minimum: 0
 *               note:
 *                 type: string
 *               rewardEligible:
 *                 type: boolean
 *                 description: Mark request eligible / not eligible for a reward
 *               rewardDecision:
 *                 type: string
 *                 enum: [PENDING, APPROVED, DENIED]
 *               attachments:
 *                 type: array
 *                 maxItems: 10
 *                 description: Completion-evidence files, from POST /maintenance/upload
 *                 items:
 *                   type: object
 *                   properties:
 *                     fileKey: { type: string }
 *                     fileName: { type: string }
 *                     fileType: { type: string }
 *     responses:
 *       200:
 *         description: Updated ticket
 *       404:
 *         description: Ticket not found
 */
router.patch('/maintenance/:ticketId', authMiddleware, requireRole(['landlord', 'admin']), updateMaintenanceTicketHandler);

/**
 * @swagger
 * /api/landlord/maintenance/upload:
 *   post:
 *     summary: Upload a completion-evidence file for a maintenance ticket
 *     description: >
 *       Returns fileKey/fileName/fileType — pass the result in the `attachments` array of
 *       PATCH /maintenance/{ticketId}.
 *     tags: [Landlord, Maintenance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: "{ fileKey, fileName, fileType }"
 *       400:
 *         description: Missing file
 */
router.post('/maintenance/upload', authMiddleware, requireRole(['landlord', 'admin']), uploadSingle, maintenanceUploadHandler);

/**
 * @swagger
 * /api/landlord/maintenance/file:
 *   get:
 *     summary: Get a signed URL for a maintenance attachment file
 *     tags: [Landlord, Maintenance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: The fileKey of the attachment (must start with "maintenance/")
 *     responses:
 *       200:
 *         description: Signed URL for the file
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *       400:
 *         description: Invalid or missing key
 */
router.get('/maintenance/file', authMiddleware, requireRole(['landlord', 'admin']), maintenanceFileSignedUrlHandler);

/**
 * @swagger
 * /api/landlord/rewards/verifications:
 *   get:
 *     summary: List RPA reward verifications for the landlord's org
 *     tags: [Landlord, Rewards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: propertyId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ELIGIBLE, SUBMITTED, PENDING_VERIFICATION, APPROVED, ISSUED, DENIED, DISPUTED, RESOLVED]
 *       - in: query
 *         name: tenantUserId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: verifications[]
 *   post:
 *     summary: Mark a tenant eligible for a reward behavior (before proof is submitted)
 *     tags: [Landlord, Rewards]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [propertyId, tenantUserId, eligibleBehavior]
 *             properties:
 *               propertyId: { type: string }
 *               unitId: { type: string }
 *               tenantUserId: { type: string }
 *               campaignId: { type: string }
 *               eligibleBehavior: { type: string }
 *               rewardType: { type: string }
 *               creditsRequested: { type: number }
 *     responses:
 *       201:
 *         description: Created verification (status ELIGIBLE)
 */
router.get('/rewards/verifications', authMiddleware, requireRole(['landlord', 'admin']), listRewardVerificationsHandler);
router.post('/rewards/verifications', authMiddleware, requireRole(['landlord', 'admin']), markEligibleHandler);

/**
 * @swagger
 * /api/landlord/rewards/verifications/{id}/start-review:
 *   patch:
 *     summary: Move a submitted verification into the active review queue
 *     tags: [Landlord, Rewards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated verification (status PENDING_VERIFICATION)
 */
router.patch('/rewards/verifications/:id/start-review', authMiddleware, requireRole(['landlord', 'admin']), startReviewHandler);

/**
 * @swagger
 * /api/landlord/rewards/verifications/{id}/review:
 *   patch:
 *     summary: Approve or deny a reward verification
 *     description: Approving issues RewardType points/credits via the ledger and moves the record to ISSUED — never a TEPA ownership token.
 *     tags: [Landlord, Rewards]
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
 *             required: [action]
 *             properties:
 *               action: { type: string, enum: [APPROVE, DENY] }
 *               creditsAwarded: { type: number }
 *               denialReason: { type: string }
 *     responses:
 *       200:
 *         description: Updated verification (status ISSUED or DENIED)
 */
router.patch('/rewards/verifications/:id/review', authMiddleware, requireRole(['landlord', 'admin']), reviewRewardVerificationHandler);

/**
 * @swagger
 * /api/landlord/rewards/verifications/{id}/resolve-dispute:
 *   patch:
 *     summary: Resolve a disputed reward verification
 *     tags: [Landlord, Rewards]
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
 *             required: [outcome]
 *             properties:
 *               outcome: { type: string, enum: [UPHOLD, OVERTURN] }
 *               creditsAwarded: { type: number }
 *               resolutionNote: { type: string }
 *     responses:
 *       200:
 *         description: Updated verification (status RESOLVED)
 */
router.patch('/rewards/verifications/:id/resolve-dispute', authMiddleware, requireRole(['landlord', 'admin']), resolveDisputeHandler);

/**
 * @swagger
 * /api/landlord/chat-settings:
 *   get:
 *     summary: Get landlord chat settings
 *     description: Returns allowDirectTenantMessaging (default true). Org-scoped.
 *     tags: [Landlord, Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "{ allowDirectTenantMessaging: boolean }"
 *   patch:
 *     summary: Update landlord chat settings
 *     description: Toggle whether tenants can start a direct chat with the landlord. Writes an audit event.
 *     tags: [Landlord, Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [allowDirectTenantMessaging]
 *             properties:
 *               allowDirectTenantMessaging:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Updated settings
 *       400:
 *         description: Validation error
 */
router.get('/chat-settings', getChatSettingsHandler);
router.patch('/chat-settings', updateChatSettingsHandler);

/**
 * @swagger
 * /api/landlord/tokens/accrual/run:
 *   post:
 *     summary: Run monthly token accrual for the org (TEPA vesting)
 *     description: >
 *       Issues monthly accrual tokens to every ACTIVE tenancy whose resolved program config has
 *       tokens enabled. Idempotent per tenant+period. Skips tenants whose Good Standing is
 *       PAUSED/SUSPENDED. Default is a dry run — pass ?dryRun=false to execute.
 *     tags: [Landlord, Tokens]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dryRun
 *         schema: { type: boolean, default: true }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [period]
 *             properties:
 *               period: { type: string, example: "2026-07" }
 *     responses:
 *       200:
 *         description: "{ period, dryRun, issued, skipped, results[] }"
 */
router.post('/tokens/accrual/run', runMonthlyAccrualHandler);

// ── Reward approval (RPA) ─────────────────────────────────────────────────────
router.get('/rewards/redemptions/pending', listPendingRedemptionsHandler);
router.patch('/rewards/redemptions/:id/review', reviewRedemptionHandler);

// ── Challenges (RPA) ──────────────────────────────────────────────────────────
router.get('/challenges', listLandlordChallengesHandler);
router.post('/challenges', createLandlordChallengeHandler);
router.patch('/challenges/:id', patchLandlordChallengeHandler);
router.delete('/challenges/:id', deleteLandlordChallengeHandler);
router.get('/challenges/:id/participations', listChallengeParticipationsHandler);
router.patch('/challenges/participations/:participationId/review', reviewParticipationHandler);

export default router;
