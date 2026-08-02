import { Router } from 'express';
import { authMiddleware } from '../../../middleware/authMiddleware';
import { importSummaryHandler, validateCsvHandler } from '../controllers/csvImport.controller';
import { csvFileUploadIfMultipart, isMultipartRequest } from '../middleware/csvFileUpload.middleware';

const router = Router();

/**
 * @swagger
 * /api/csv/validate:
 *   post:
 *     summary: Validate uploaded CSV (BE-308)
 *     description: |
 *       Use **either**:
 *       - `application/json` with `csv` (string) and `schema` (object)
 *       - `multipart/form-data` with `file` (the .csv) and `schema` (a **string** of JSON for CsvImportSchema)
 *     tags: [CSV]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CsvValidateRequest'
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, schema]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The CSV file
 *               schema:
 *                 type: string
 *                 description: JSON string of CsvImportSchema (same as the `schema` object in the JSON body)
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CsvValidateApiResponse'
 *       400:
 *         description: Validation of request or schema failed
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/validate',
  authMiddleware,
  (req, res, next) => {
    if (isMultipartRequest(req)) {
      return csvFileUploadIfMultipart(req, res, next);
    }
    return next();
  },
  validateCsvHandler
);

/**
 * @swagger
 * /api/csv/import/summary:
 *   post:
 *     summary: CSV import summary (BE-309)
 *     description: |
 *       **Request body** = the same object as the **`data`** field from `POST /api/csv/validate` (copy-paste the validate response `data` in Swagger, or use the pre-filled **Example**).
 *       **Bearer token** required (Authorize first).
 *     tags: [CSV]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CsvImportSummaryRequest'
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CsvImportSummaryApiResponse'
 *       400:
 *         description: Request validation failed
 *       401:
 *         description: Unauthorized
 */
router.post('/import/summary', authMiddleware, importSummaryHandler);

export default router;
