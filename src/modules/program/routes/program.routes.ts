import { Router } from "express";
import { authMiddleware } from "../../../middleware/authMiddleware";
import {
  calculatePropertyTaxImpactHandler,
  createProjectHandler,
  createVendorSpendRecordHandler,
  evaluateProjectRiskFlagsHandler,
  getCohortLevelAggregationHandler,
  getComplianceStatusAndAuditSchedulerHandler,
  getEconomicActivityAndTaxProxyHandler,
  getPledgeTrackingHandler,
  getProgramSummaryMetricsHandler,
  getSpendAndVendorClassificationHandler,
  getTotalPublicBenefitSummaryHandler,
  listProjectsHandler,
  upsertPledgeHandler,
  upsertProgramComplianceHandler,
  upsertTepaParticipationHandler,
} from "../controllers/program.controller";

const router = Router();

// Ticket 2 - Program Summary Metrics API
/**
 * @swagger
 * /api/program/summary-metrics:
 *   get:
 *     summary: Get top-level program KPIs
 *     tags: [Program]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Program summary metrics
 */
router.get("/summary-metrics", authMiddleware, getProgramSummaryMetricsHandler);

// Ticket 3 - Project Registry & Status API
/**
 * @swagger
 * /api/program/projects:
 *   post:
 *     summary: Create a program project
 *     tags: [Program]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, city, state, developer, projectType, unitsPlanned, status]
 *             properties:
 *               name: { type: string }
 *               city: { type: string }
 *               state: { type: string }
 *               developer: { type: string }
 *               projectType:
 *                 type: string
 *                 enum: [BTR, SFR, WORKFORCE, AFFORDABLE, LUXURY, MIXED_USE]
 *               unitsPlanned: { type: number }
 *               unitsDelivered: { type: number }
 *               status:
 *                 type: string
 *                 enum: [LEASING, CONSTRUCTION, STABILIZED]
 *               percentComplete: { type: number }
 *     responses:
 *       201:
 *         description: Project created
 */
router.post("/projects", authMiddleware, createProjectHandler);
/**
 * @swagger
 * /api/program/projects:
 *   get:
 *     summary: List projects with status and progress
 *     tags: [Program]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Project registry list
 */
router.get("/projects", authMiddleware, listProjectsHandler);

// Ticket 4 - Project Risk Flags Engine
/**
 * @swagger
 * /api/program/projects/{projectId}/risk-flags/evaluate:
 *   post:
 *     summary: Evaluate and store project risk flags
 *     tags: [Program]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Risk flags and schedule status
 */
router.post(
  "/projects/:projectId/risk-flags/evaluate",
  authMiddleware,
  evaluateProjectRiskFlagsHandler,
);

// Ticket 5 - Spend & Vendor Classification
/**
 * @swagger
 * /api/program/spend/vendor-records:
 *   post:
 *     summary: Create a vendor spend record
 *     tags: [Program]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [projectId, vendorName, vendorCategory, geographyTag, amount]
 *             properties:
 *               projectId: { type: string }
 *               vendorName: { type: string }
 *               vendorCategory:
 *                 type: string
 *                 enum: [CONSTRUCTION, MAINTENANCE, PROFESSIONAL_SERVICES, OTHER]
 *               geographyTag:
 *                 type: string
 *                 enum: [LOCAL_CITY, STATE, NON_LOCAL]
 *               amount: { type: number }
 *               taxable: { type: boolean }
 *     responses:
 *       201:
 *         description: Vendor spend record created
 */
router.post(
  "/spend/vendor-records",
  authMiddleware,
  createVendorSpendRecordHandler,
);
/**
 * @swagger
 * /api/program/spend/vendor-classification:
 *   get:
 *     summary: Get spend by geography and vendor category
 *     tags: [Program]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Spend classification totals
 */
router.get(
  "/spend/vendor-classification",
  authMiddleware,
  getSpendAndVendorClassificationHandler,
);

// Ticket 8 - Cohort-Level Aggregation Engine
/**
 * @swagger
 * /api/program/tepa/participation:
 *   post:
 *     summary: Upsert TEPA participation ledger row
 *     tags: [Program]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tenantId, entryYear]
 *             properties:
 *               tenantId: { type: string }
 *               entryYear: { type: number }
 *               participationStatus:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE, EXITED]
 *               annualAccumulation: { type: number }
 *               totalAccumulationValue: { type: number }
 *     responses:
 *       200:
 *         description: Participation row upserted
 */
router.post(
  "/tepa/participation",
  authMiddleware,
  upsertTepaParticipationHandler,
);
/**
 * @swagger
 * /api/program/tepa/cohorts:
 *   get:
 *     summary: Get cohort-level TEPA aggregates
 *     tags: [Program]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cohort metrics by entry year
 */
router.get("/tepa/cohorts", authMiddleware, getCohortLevelAggregationHandler);

// Ticket 9 - Property Tax Impact Calculator
/**
 * @swagger
 * /api/program/fiscal/property-tax/calculate:
 *   post:
 *     summary: Calculate property tax impact from assessed values and millage
 *     tags: [Program]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [preDevelopmentAssessedValue, postDevelopmentAssessedValue, municipalMillageRate]
 *             properties:
 *               preDevelopmentAssessedValue: { type: number }
 *               postDevelopmentAssessedValue: { type: number }
 *               municipalMillageRate: { type: number }
 *     responses:
 *       200:
 *         description: Tax impact calculation
 */
router.post(
  "/fiscal/property-tax/calculate",
  authMiddleware,
  calculatePropertyTaxImpactHandler,
);

// Ticket 10 - Economic Activity & Tax Proxy Engine
/**
 * @swagger
 * /api/program/fiscal/economic-activity-proxy:
 *   get:
 *     summary: Get taxable economic activity and tax proxy metrics
 *     tags: [Program]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Economic activity and tax proxy summary
 */
router.get(
  "/fiscal/economic-activity-proxy",
  authMiddleware,
  getEconomicActivityAndTaxProxyHandler,
);

// Ticket 11 - Total Public Benefit Summary
/**
 * @swagger
 * /api/program/fiscal/total-public-benefit:
 *   get:
 *     summary: Get total public benefit roll-up
 *     tags: [Program]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Public benefit summary totals
 */
router.get(
  "/fiscal/total-public-benefit",
  authMiddleware,
  getTotalPublicBenefitSummaryHandler,
);

// Ticket 12 - Pledge Tracking Engine
/**
 * @swagger
 * /api/program/compliance/pledges:
 *   post:
 *     summary: Upsert pledge tracking record
 *     tags: [Program]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [projectId, pledgeType, promised, achieved]
 *             properties:
 *               projectId: { type: string }
 *               pledgeType:
 *                 type: string
 *                 enum: [AFFORDABLE_UNITS, LOCAL_VENDOR_PERCENT, TEPA_PARTICIPATION_PERCENT, PROGRAM_COMPLETION_MILESTONES]
 *               promised: { type: number }
 *               achieved: { type: number }
 *     responses:
 *       200:
 *         description: Pledge tracking updated
 *   get:
 *     summary: List pledge tracking records
 *     tags: [Program]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pledge tracking records
 */
router.post("/compliance/pledges", authMiddleware, upsertPledgeHandler);
router.get("/compliance/pledges", authMiddleware, getPledgeTrackingHandler);

// Ticket 13 - Compliance Status & Audit Scheduler
/**
 * @swagger
 * /api/program/compliance/status:
 *   post:
 *     summary: Upsert project compliance status and next audit date
 *     tags: [Program]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [projectId]
 *             properties:
 *               projectId: { type: string }
 *               zoningCompliance: { type: boolean }
 *               housingCovenantsCompliance: { type: boolean }
 *               reportingComplete: { type: boolean }
 *               programCompletionMilestonesMet: { type: boolean }
 *               nextAuditDate: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Compliance status upserted
 *   get:
 *     summary: Get compliance overview and next audit schedule
 *     tags: [Program]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Compliance and audit scheduler summary
 */
router.post(
  "/compliance/status",
  authMiddleware,
  upsertProgramComplianceHandler,
);
router.get(
  "/compliance/status",
  authMiddleware,
  getComplianceStatusAndAuditSchedulerHandler,
);

export default router;