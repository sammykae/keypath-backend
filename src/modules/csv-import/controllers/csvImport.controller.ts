import { Request, Response, NextFunction } from 'express';
import { CsvImportSchema } from '../types/csvImport.types';
import { CsvImportSummaryBody, CsvImportSchemaZod, CsvValidateBody } from '../dto/csvImport.dto';
import { validateCsvString } from '../services/csvValidationEngine.service';
import { buildImportSummaryFromPayload } from '../services/csvImportSummary.service';
import { errorResponse, successResponse } from '../../../core/utils/response';
import { isMultipartRequest } from '../middleware/csvFileUpload.middleware';

export const validateCsvHandler = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const multipart = isMultipartRequest(req);
    if (multipart) {
      const file = (req as { file?: Express.Multer.File }).file;
      if (!file?.buffer) {
        errorResponse(
          res,
          400,
          'VALIDATION_ERROR',
          'Send multipart: field "file" (csv) and field "schema" (JSON string of CsvImportSchema)'
        );
        return;
      }
      const csv = file.buffer.toString('utf8');
      if (!csv.trim()) {
        errorResponse(res, 400, 'VALIDATION_ERROR', 'Uploaded file is empty');
        return;
      }
      const rawSchema = (req as { body?: { schema?: unknown } }).body?.schema;
      if (rawSchema === undefined || rawSchema === null) {
        errorResponse(res, 400, 'VALIDATION_ERROR', 'Field "schema" (JSON) is required with multipart file upload');
        return;
      }
      let schema: CsvImportSchema;
      try {
        const parsed: unknown =
          typeof rawSchema === 'string' ? JSON.parse(rawSchema) : rawSchema;
        schema = CsvImportSchemaZod.parse(parsed);
      } catch (e) {
        if (e instanceof SyntaxError) {
          errorResponse(res, 400, 'VALIDATION_ERROR', 'Field "schema" must be valid JSON');
          return;
        }
        next(e);
        return;
      }
      const result = validateCsvString(csv, schema);
      successResponse(res, result);
      return;
    }

    const { csv, schema } = CsvValidateBody.parse(req.body);
    const result = validateCsvString(csv, schema);
    successResponse(res, result);
  } catch (e) {
    next(e);
  }
};

/**
 * `POST /import/summary` — body includes validation result fields.
 * The response includes totalRows, valid, errorIssues, warningIssues, and counts (BE-309).
 */
export const importSummaryHandler = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const payload = CsvImportSummaryBody.parse(req.body);
    const summary = buildImportSummaryFromPayload(payload);
    successResponse(res, summary);
  } catch (e) {
    next(e);
  }
};
