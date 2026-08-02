import { Router } from 'express';
import { authMiddleware } from '../../../middleware/authMiddleware';
import { requireRole } from '../../../middleware/rbac.middleware';
import { validateRequest } from '../../../middleware/validate.middleware';
import { uploadSingle } from '../../docs/middleware/upload.middleware';
import {
  uploadCsvHandler,
  listCsvIngestionsHandler,
  getCsvIngestionHandler,
  previewCsvIngestionHandler,
  saveCsvMappingHandler,
  processCsvIngestionHandler,
  listImportSourcesHandler,
  persistCsvTenantsHandler,
} from '../controllers/csv-ingestion.controller';
import { saveMappingSchema, triggerProcessSchema } from '../dto/csv-mapping.dto';

const router = Router();

/**
 * @openapi
 * /api/csv/upload:
 *   post:
 *     tags:
 *       - CSV Ingestion
 *     summary: Upload a CSV file for ingestion (BE-110)
 *     description: >
 *       Accepts a CSV file as multipart/form-data. Stores the raw file in S3,
 *       counts data rows, creates an ingestion record, and queues a processing job.
 *       The processing job is a stub in Week 1 — BE-111 (Week 2) adds the column
 *       mapping engine that drives real parsing.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *               - ingestionType
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The CSV file to upload
 *               ingestionType:
 *                 type: string
 *                 enum: [TENANT, PROPERTY, UNIT, PAYMENT, LEASE, OTHER]
 *                 description: What type of data this CSV contains
 *     responses:
 *       201:
 *         description: CSV uploaded and ingestion record created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     ingestionId: { type: string }
 *                     orgId: { type: string }
 *                     originalFileName: { type: string }
 *                     ingestionType: { type: string }
 *                     status: { type: string, enum: [PENDING, PROCESSING, COMPLETE, FAILED] }
 *                     rowCount: { type: integer }
 *                     fileSizeBytes: { type: integer }
 *                     fileUrl: { type: string }
 *                     createdAt: { type: string, format: date-time }
 *       400:
 *         description: Missing file, invalid file type, or invalid ingestionType
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient role
 */
router.post(
  '/upload',
  authMiddleware,
  requireRole(['landlord', 'admin']),
  uploadSingle,
  uploadCsvHandler
);

/**
 * @openapi
 * /api/csv:
 *   get:
 *     tags:
 *       - CSV Ingestion
 *     summary: List CSV ingestion records for the caller's org
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, PROCESSING, COMPLETE, FAILED]
 *       - in: query
 *         name: ingestionType
 *         schema:
 *           type: string
 *           enum: [TENANT, PROPERTY, UNIT, PAYMENT, LEASE, OTHER]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *     responses:
 *       200:
 *         description: List of ingestion records
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/',
  authMiddleware,
  requireRole(['landlord', 'admin']),
  listCsvIngestionsHandler
);

/**
 * @openapi
 * /api/csv/sources:
 *   get:
 *     tags:
 *       - CSV Ingestion
 *     summary: List available and coming-soon import sources (for the activation flow UI)
 *     description: >
 *       CSV_UPLOAD, EXCEL_UPLOAD, and MANUAL_ENTRY are available today. PMS connectors
 *       (AppFolio, Yardi, Buildium, RealPage, Entrata, MRI) are reserved slots in the
 *       same import framework, returned as COMING_SOON.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: sources[] ({ source, label, status })
 */
router.get(
  '/sources',
  authMiddleware,
  requireRole(['landlord', 'admin']),
  listImportSourcesHandler
);

/**
 * @openapi
 * /api/csv/{ingestionId}:
 *   get:
 *     tags:
 *       - CSV Ingestion
 *     summary: Get a single CSV ingestion record
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ingestionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ingestion record detail
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not found
 */
router.get(
  '/:ingestionId',
  authMiddleware,
  requireRole(['landlord', 'admin']),
  getCsvIngestionHandler
);

/**
 * @openapi
 * /api/csv/{ingestionId}/preview:
 *   get:
 *     tags:
 *       - CSV Ingestion
 *     summary: Preview CSV headers, first 5 rows, and suggested column mapping (BE-111)
 *     description: >
 *       Returns the CSV file's column headers, up to 5 data rows for inspection,
 *       the auto-detected (or already-saved) column mapping, any required fields
 *       that are still unmapped, and the canonical field schema for the ingestion type.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ingestionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Preview data and suggested mapping
 *       404:
 *         description: Ingestion record not found
 *       422:
 *         description: CSV file could not be retrieved from storage
 */
router.get(
  '/:ingestionId/preview',
  authMiddleware,
  requireRole(['landlord', 'admin']),
  previewCsvIngestionHandler
);

/**
 * @openapi
 * /api/csv/{ingestionId}/mapping:
 *   patch:
 *     tags:
 *       - CSV Ingestion
 *     summary: Save a confirmed column mapping (BE-111)
 *     description: >
 *       Persists the user-confirmed mapping of CSV column headers to canonical system
 *       field names. Returns whether all required fields are covered (readyToProcess).
 *       Call POST /process next to run the validation engine.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ingestionId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - mapping
 *             properties:
 *               mapping:
 *                 type: object
 *                 additionalProperties:
 *                   type: string
 *                   nullable: true
 *                 description: >
 *                   Keys are the exact CSV column headers.
 *                   Values are canonical field names (e.g. "firstName") or null to leave unmapped.
 *     responses:
 *       200:
 *         description: Mapping saved
 *       400:
 *         description: Validation error
 *       409:
 *         description: Record is currently processing
 */
router.patch(
  '/:ingestionId/mapping',
  authMiddleware,
  requireRole(['landlord', 'admin']),
  validateRequest(saveMappingSchema),
  saveCsvMappingHandler
);

/**
 * @openapi
 * /api/csv/{ingestionId}/process:
 *   post:
 *     tags:
 *       - CSV Ingestion
 *     summary: Trigger CSV processing with the confirmed column mapping (BE-111)
 *     description: >
 *       Runs the column-mapping + row-validation engine asynchronously.
 *       The record transitions to PROCESSING immediately, then to COMPLETE or FAILED.
 *       Poll GET /api/csv/:ingestionId for the final result.
 *       Add ?force=true to re-process an already-COMPLETE record.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ingestionId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: force
 *         schema:
 *           type: boolean
 *         description: Set to true to re-process an already-COMPLETE record
 *     responses:
 *       202:
 *         description: Processing started
 *       404:
 *         description: Ingestion record not found
 *       409:
 *         description: Already processing or already complete (without force)
 */
router.post(
  '/:ingestionId/process',
  authMiddleware,
  requireRole(['landlord', 'admin']),
  validateRequest(triggerProcessSchema),
  processCsvIngestionHandler
);

/**
 * @openapi
 * /api/csv/{ingestionId}/persist:
 *   post:
 *     tags:
 *       - CSV Ingestion
 *     summary: Persist stage — create real tenant invites/tenancies from validated rows
 *     description: >
 *       Completes the import pipeline (validate → normalize → map → audit → persist) for
 *       ingestionType TENANT. Requires status COMPLETE. Each valid row resolves a unit by
 *       propertyRef + unitRef and calls the same inviteTenant logic used by the manual
 *       "Invite Tenant" dialog — identical audit trail, duplicate-unit guard, and invite email.
 *       Rows missing propertyRef/unitRef/monthlyRent are SKIPPED; unit-not-found or
 *       already-occupied rows are reported as ERROR. Nothing here is auto-triggered by
 *       /process — this is an explicit, separate step.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ingestionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: "{ persistStatus, tenantsCreated, persistResults[] }"
 *       400:
 *         description: Wrong ingestionType or not yet COMPLETE
 *       404:
 *         description: Not found
 *       409:
 *         description: Persist already in progress
 */
router.post(
  '/:ingestionId/persist',
  authMiddleware,
  requireRole(['landlord', 'admin']),
  persistCsvTenantsHandler
);

export default router;
