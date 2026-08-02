import { Response } from 'express';
import { Types } from 'mongoose';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { Membership } from '../../orgs/models/membership.model';
import {
  uploadCsvAndCreateRecord,
  listIngestionsByOrg,
  getIngestionById,
} from '../services/csv-ingestion.service';
import { CsvIngestionModel, CsvIngestionType } from '../models/csv-ingestion.model';
import { buildCsvPreview, runProcessing } from '../services/csv-processor.service';
import { validateMapping, ColumnMapping } from '../services/column-mapping.service';
import { persistTenantRows } from '../services/csv-persist.service';
import { writeAuditEvent } from '../../audit/services/audit.service';
import { AppError } from '../../../core/errors/AppError';

const ALLOWED_MIME_TYPES = [
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'text/plain',
  'text/x-csv',
];

const VALID_INGESTION_TYPES: CsvIngestionType[] = [
  'TENANT',
  'PROPERTY',
  'UNIT',
  'PAYMENT',
  'LEASE',
  'OTHER',
];

async function resolveOrgId(userId: string): Promise<Types.ObjectId | null> {
  const membership = await Membership.findOne({
    userId: new Types.ObjectId(userId),
    status: 'active',
  }).lean();
  return membership ? (membership.orgId as Types.ObjectId) : null;
}

export async function uploadCsvHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.auth) {
    errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return;
  }

  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file || !Buffer.isBuffer(file.buffer)) {
    errorResponse(
      res,
      400,
      'MISSING_FILE',
      'Send CSV as multipart form-data with field name "file"'
    );
    return;
  }

  if (!ALLOWED_MIME_TYPES.includes(file.mimetype) && !file.originalname.endsWith('.csv')) {
    errorResponse(res, 400, 'INVALID_FILE_TYPE', 'Only CSV files are accepted');
    return;
  }

  const ingestionType = (req.body?.ingestionType as string)?.toUpperCase() as CsvIngestionType;
  if (!ingestionType || !VALID_INGESTION_TYPES.includes(ingestionType)) {
    errorResponse(
      res,
      400,
      'INVALID_INGESTION_TYPE',
      `ingestionType must be one of: ${VALID_INGESTION_TYPES.join(', ')}`
    );
    return;
  }

  const userId = String(req.auth._id);
  const orgId = await resolveOrgId(userId);
  if (!orgId) {
    errorResponse(
      res,
      400,
      'ORG_REQUIRED',
      'You must belong to an organization to upload CSV files'
    );
    return;
  }

  const record = await uploadCsvAndCreateRecord({
    orgId,
    uploadedByUserId: new Types.ObjectId(userId),
    buffer: file.buffer,
    originalFileName: file.originalname,
    mimeType: file.mimetype,
    ingestionType,
  });

  successResponse(
    res,
    {
      ingestionId: record._id.toString(),
      orgId: record.orgId.toString(),
      uploadedByUserId: record.uploadedByUserId.toString(),
      originalFileName: record.originalFileName,
      ingestionType: record.ingestionType,
      status: record.status,
      rowCount: record.rowCount,
      fileSizeBytes: record.fileSizeBytes,
      fileUrl: record.fileUrl,
      createdAt: record.createdAt,
    },
    201
  );
}

export async function listCsvIngestionsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.auth) {
    errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return;
  }

  const userId = String(req.auth._id);
  const orgId = await resolveOrgId(userId);
  if (!orgId) {
    errorResponse(res, 400, 'ORG_REQUIRED', 'You must belong to an organization');
    return;
  }

  const records = await listIngestionsByOrg(orgId, {
    status: req.query.status as string | undefined,
    ingestionType: req.query.ingestionType as string | undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });

  successResponse(res, {
    items: records.map((r) => ({
      ingestionId: r._id.toString(),
      originalFileName: r.originalFileName,
      ingestionType: r.ingestionType,
      status: r.status,
      rowCount: r.rowCount,
      fileSizeBytes: r.fileSizeBytes,
      createdAt: r.createdAt,
    })),
    total: records.length,
  });
}

export async function getCsvIngestionHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.auth) {
    errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return;
  }

  const userId = String(req.auth._id);
  const orgId = await resolveOrgId(userId);
  if (!orgId) {
    errorResponse(res, 400, 'ORG_REQUIRED', 'You must belong to an organization');
    return;
  }

  const record = await getIngestionById(req.params.ingestionId, orgId);
  if (!record) {
    errorResponse(res, 404, 'NOT_FOUND', 'CSV ingestion record not found');
    return;
  }

  successResponse(res, {
    ingestionId: record._id.toString(),
    orgId: record.orgId.toString(),
    uploadedByUserId: record.uploadedByUserId.toString(),
    originalFileName: record.originalFileName,
    s3Key: record.s3Key,
    fileUrl: record.fileUrl,
    ingestionType: record.ingestionType,
    status: record.status,
    rowCount: record.rowCount,
    fileSizeBytes: record.fileSizeBytes,
    errorMessage: record.errorMessage ?? null,
    columnMapping: record.columnMapping ?? null,
    rowsProcessed: record.rowsProcessed,
    rowsFailed: record.rowsFailed,
    processingErrors: record.processingErrors,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

/**
 * GET /api/csv/:ingestionId/preview
 * Returns headers, first 5 rows, and the current (or auto-detected) column mapping.
 */
export async function previewCsvIngestionHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.auth) {
    errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return;
  }

  const userId = String(req.auth._id);
  const orgId = await resolveOrgId(userId);
  if (!orgId) {
    errorResponse(res, 400, 'ORG_REQUIRED', 'You must belong to an organization');
    return;
  }

  const record = await getIngestionById(req.params.ingestionId, orgId);
  if (!record) {
    errorResponse(res, 404, 'NOT_FOUND', 'CSV ingestion record not found');
    return;
  }

  const preview = await buildCsvPreview(
    record.s3Key,
    record.ingestionType,
    record.columnMapping as ColumnMapping | null
  );

  if (!preview) {
    errorResponse(res, 422, 'FILE_UNAVAILABLE', 'CSV file could not be retrieved from storage');
    return;
  }

  successResponse(res, {
    ingestionId: record._id.toString(),
    ingestionType: record.ingestionType,
    status: record.status,
    ...preview,
  });
}

/**
 * PATCH /api/csv/:ingestionId/mapping
 * Saves a (user-confirmed) column mapping onto the ingestion record.
 * Transitions the status to MAPPED if all required fields are covered,
 * or keeps it at MAPPING_REQUIRED if gaps remain.
 */
export async function saveCsvMappingHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.auth) {
    errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return;
  }

  const userId = String(req.auth._id);
  const orgId = await resolveOrgId(userId);
  if (!orgId) {
    errorResponse(res, 400, 'ORG_REQUIRED', 'You must belong to an organization');
    return;
  }

  const record = await getIngestionById(req.params.ingestionId, orgId);
  if (!record) {
    errorResponse(res, 404, 'NOT_FOUND', 'CSV ingestion record not found');
    return;
  }

  if (record.status === 'PROCESSING') {
    errorResponse(res, 409, 'ALREADY_PROCESSING', 'Cannot update mapping while record is processing');
    return;
  }

  const mapping = req.body.mapping as ColumnMapping;
  const { valid, missingRequired } = validateMapping(mapping, record.ingestionType);

  // Status stays MAPPING_REQUIRED until the user calls /process.
  // We store the mapping now so /process can use it.
  await CsvIngestionModel.findByIdAndUpdate(record._id, {
    columnMapping: mapping,
    status: 'MAPPING_REQUIRED',
    errorMessage: missingRequired.length > 0
      ? `Required fields not mapped: ${missingRequired.join(', ')}`
      : null,
  });

  await writeAuditEvent({
    actorUserId: new Types.ObjectId(userId),
    orgId,
    action: 'CSV_MAPPING_SAVED',
    entityType: 'CsvIngestion',
    entityId: record._id,
    diff: {
      before: { columnMapping: record.columnMapping },
      after: { columnMapping: mapping },
    },
  });

  successResponse(res, {
    ingestionId: record._id.toString(),
    status: 'MAPPING_REQUIRED',
    mapping,
    missingRequired,
    readyToProcess: valid,
  });
}

/**
 * POST /api/csv/:ingestionId/process
 * Triggers the column-mapping + validation engine on the saved mapping.
 * The record transitions MAPPING_REQUIRED → PROCESSING → COMPLETE | FAILED.
 */
export async function processCsvIngestionHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.auth) {
    errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return;
  }

  const userId = String(req.auth._id);
  const orgId = await resolveOrgId(userId);
  if (!orgId) {
    errorResponse(res, 400, 'ORG_REQUIRED', 'You must belong to an organization');
    return;
  }

  const record = await getIngestionById(req.params.ingestionId, orgId);
  if (!record) {
    errorResponse(res, 404, 'NOT_FOUND', 'CSV ingestion record not found');
    return;
  }

  if (record.status === 'PROCESSING') {
    errorResponse(res, 409, 'ALREADY_PROCESSING', 'This ingestion is already being processed');
    return;
  }

  if (record.status === 'COMPLETE' && req.query.force !== 'true') {
    errorResponse(
      res,
      409,
      'ALREADY_COMPLETE',
      'This ingestion is already complete. Pass ?force=true to re-process.'
    );
    return;
  }

  // Fire-and-forget — the engine runs asynchronously and updates the record itself
  runProcessing(record._id.toString()).catch((err) =>
    console.error('[CSV_PROCESS_ERROR]', err)
  );

  successResponse(res, {
    ingestionId: record._id.toString(),
    status: 'PROCESSING',
    message: 'Processing started. Poll GET /api/csv/:ingestionId for the result.',
  }, 202);
}

/** Import sources for the activation-flow UI. Only CSV_UPLOAD is implemented today. */
const IMPORT_SOURCES = [
  { source: 'CSV_UPLOAD', label: 'Upload CSV / Rent Roll', status: 'AVAILABLE' },
  { source: 'EXCEL_UPLOAD', label: 'Upload Excel', status: 'AVAILABLE' },
  { source: 'MANUAL_ENTRY', label: 'Enter Manually', status: 'AVAILABLE' },
  { source: 'PMS_APPFOLIO', label: 'Connect AppFolio', status: 'COMING_SOON' },
  { source: 'PMS_YARDI', label: 'Connect Yardi', status: 'COMING_SOON' },
  { source: 'PMS_BUILDIUM', label: 'Connect Buildium', status: 'COMING_SOON' },
  { source: 'PMS_REALPAGE', label: 'Connect RealPage', status: 'COMING_SOON' },
  { source: 'PMS_ENTRATA', label: 'Connect Entrata', status: 'COMING_SOON' },
  { source: 'PMS_MRI', label: 'Connect MRI', status: 'COMING_SOON' },
] as const;

/**
 * GET /api/csv/sources
 * Lists every import source the platform knows about — AVAILABLE ones work
 * today, COMING_SOON ones are reserved slots in the same framework so the
 * activation flow can render "Coming Soon" without a backend change later.
 */
export async function listImportSourcesHandler(_req: AuthenticatedRequest, res: Response): Promise<void> {
  successResponse(res, { sources: IMPORT_SOURCES });
}

/**
 * POST /api/csv/:ingestionId/persist
 * Persist stage: creates real tenant invites/tenancies for every validated
 * row (ingestionType TENANT only, record must already be COMPLETE). Reuses
 * the same inviteTenant logic as the manual "Invite Tenant" dialog.
 */
export async function persistCsvTenantsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.auth) {
    errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return;
  }
  const userId = String(req.auth._id);
  const orgId = await resolveOrgId(userId);
  if (!orgId) {
    errorResponse(res, 400, 'ORG_REQUIRED', 'You must belong to an organization');
    return;
  }

  const record = await getIngestionById(req.params.ingestionId, orgId);
  if (!record) {
    errorResponse(res, 404, 'NOT_FOUND', 'CSV ingestion record not found');
    return;
  }

  try {
    const persisted = await persistTenantRows(req.params.ingestionId, new Types.ObjectId(userId));
    successResponse(res, {
      ingestionId: persisted._id.toString(),
      persistStatus: persisted.persistStatus,
      tenantsCreated: persisted.tenantsCreated,
      persistResults: persisted.persistResults,
    });
  } catch (err) {
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'PERSIST_FAILED', err.message);
      return;
    }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to persist tenant rows');
  }
}
