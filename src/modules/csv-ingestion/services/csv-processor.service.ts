import { storage } from '../../docs/storage';
import { CsvIngestionModel, ICsvIngestion } from '../models/csv-ingestion.model';
import { writeAuditEvent } from '../../audit/services/audit.service';
import {
  autoDetectMapping,
  validateMapping,
  getSchemaFields,
  ColumnMapping,
} from './column-mapping.service';

const MAX_PROCESSING_ERRORS = 50;
const PREVIEW_ROW_COUNT = 5;

// --- CSV Parser ---
// Handles quoted fields, escaped double-quotes, and CRLF/LF line endings.
// Does NOT handle multi-line quoted fields (rare in property-management exports).

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCsvContent(buffer: Buffer): { headers: string[]; rows: string[][] } {
  // Strip UTF-8 BOM if present
  let text = buffer.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((l) => parseCsvLine(l));
  return { headers, rows };
}

// --- Storage ---

export async function fetchCsvBuffer(s3Key: string): Promise<Buffer | null> {
  if (typeof storage.get !== 'function') return null;
  return storage.get(s3Key);
}

// --- Row-level validation ---

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function isValidNumber(v: string): boolean {
  return v.length > 0 && !isNaN(Number(v));
}

function isValidDate(v: string): boolean {
  const d = new Date(v);
  return !isNaN(d.getTime());
}

function validateRow(
  rowValues: Record<string, string>,
  ingestionType: ICsvIngestion['ingestionType']
): { valid: boolean; errors: string[] } {
  const schemaFields = getSchemaFields(ingestionType);
  const errors: string[] = [];

  for (const field of schemaFields) {
    const value = (rowValues[field.name] ?? '').trim();

    if (field.required && value === '') {
      errors.push(`Required field "${field.label}" is missing or empty`);
      continue;
    }

    if (value === '') continue; // optional + empty = OK

    if (field.type === 'email' && !isValidEmail(value)) {
      errors.push(`"${field.label}" is not a valid email address`);
    } else if (field.type === 'number' && !isValidNumber(value)) {
      errors.push(`"${field.label}" must be a number`);
    } else if (field.type === 'date' && !isValidDate(value)) {
      errors.push(`"${field.label}" is not a valid date`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// --- Preview ---

export interface CsvPreviewResult {
  headers: string[];
  previewRows: string[][];
  totalRows: number;
  suggestedMapping: ColumnMapping;
  missingRequired: string[];
  schemaFields: ReturnType<typeof getSchemaFields>;
}

export async function buildCsvPreview(
  s3Key: string,
  ingestionType: ICsvIngestion['ingestionType'],
  existingMapping?: ColumnMapping | null
): Promise<CsvPreviewResult | null> {
  const buffer = await fetchCsvBuffer(s3Key);
  if (!buffer) return null;

  const { headers, rows } = parseCsvContent(buffer);

  let mapping: ColumnMapping;
  let missingRequired: string[];

  if (existingMapping && Object.keys(existingMapping).length > 0) {
    mapping = existingMapping;
    missingRequired = validateMapping(existingMapping, ingestionType).missingRequired;
  } else {
    const detected = autoDetectMapping(headers, ingestionType);
    mapping = detected.mapping;
    missingRequired = detected.missingRequired;
  }

  return {
    headers,
    previewRows: rows.slice(0, PREVIEW_ROW_COUNT),
    totalRows: rows.length,
    suggestedMapping: mapping,
    missingRequired,
    schemaFields: getSchemaFields(ingestionType),
  };
}

// --- Canonical row extraction (shared by the processing engine and the persist stage) ---

export interface MappedRow {
  /** 1-based row number, header row = row 1, so first data row = 2 (matches processingErrors). */
  row: number;
  values: Record<string, string>;
  valid: boolean;
  errors: string[];
}

/**
 * Re-derives the canonical field values for every data row using the record's
 * confirmed (or auto-detected) column mapping, and re-runs the same row
 * validation used by runProcessing. Used by the persist stage so it only
 * acts on rows that pass validation, without re-implementing CSV parsing.
 */
export async function getMappedRows(record: ICsvIngestion): Promise<MappedRow[] | null> {
  const buffer = await fetchCsvBuffer(record.s3Key);
  if (!buffer) return null;

  const { headers, rows } = parseCsvContent(buffer);
  if (headers.length === 0) return [];

  const saved = record.columnMapping as ColumnMapping | null;
  const mapping = saved && Object.keys(saved).length > 0
    ? saved
    : autoDetectMapping(headers, record.ingestionType).mapping;

  const headerIndex = new Map(headers.map((h, i) => [h, i]));
  const canonicalToHeader = new Map<string, string>();
  for (const [header, canonical] of Object.entries(mapping)) {
    if (canonical) canonicalToHeader.set(canonical, header);
  }

  return rows.map((rawRow, i) => {
    const values: Record<string, string> = {};
    for (const field of getSchemaFields(record.ingestionType)) {
      const header = canonicalToHeader.get(field.name);
      if (header !== undefined) {
        const idx = headerIndex.get(header) ?? -1;
        values[field.name] = idx >= 0 ? (rawRow[idx] ?? '') : '';
      }
    }
    const { valid, errors } = validateRow(values, record.ingestionType);
    return { row: i + 2, values, valid, errors };
  });
}

// --- Main processing engine ---

export async function runProcessing(ingestionId: string): Promise<void> {
  const record = await CsvIngestionModel.findById(ingestionId);
  if (!record) {
    console.error(`[CSV_PROCESSOR] Record ${ingestionId} not found`);
    return;
  }

  // Prevent double-processing
  if (record.status === 'PROCESSING') {
    console.warn(`[CSV_PROCESSOR] ${ingestionId} already in PROCESSING — skipping`);
    return;
  }

  await CsvIngestionModel.findByIdAndUpdate(ingestionId, { status: 'PROCESSING' });

  try {
    const buffer = await fetchCsvBuffer(record.s3Key);

    if (!buffer) {
      await CsvIngestionModel.findByIdAndUpdate(ingestionId, {
        status: 'FAILED',
        errorMessage: 'Could not retrieve CSV file from storage',
      });
      return;
    }

    const { headers, rows } = parseCsvContent(buffer);

    if (headers.length === 0) {
      await CsvIngestionModel.findByIdAndUpdate(ingestionId, {
        status: 'FAILED',
        errorMessage: 'CSV file has no headers',
      });
      return;
    }

    // Determine mapping: honour the saved mapping if present, else auto-detect
    const saved = record.columnMapping as ColumnMapping | null;
    let mapping: ColumnMapping;
    let missingRequired: string[];

    if (saved && Object.keys(saved).length > 0) {
      mapping = saved;
      missingRequired = validateMapping(saved, record.ingestionType).missingRequired;
    } else {
      const detected = autoDetectMapping(headers, record.ingestionType);
      mapping = detected.mapping;
      missingRequired = detected.missingRequired;
    }

    if (missingRequired.length > 0) {
      // Persist the partial mapping so the frontend can show the current state
      await CsvIngestionModel.findByIdAndUpdate(ingestionId, {
        status: 'MAPPING_REQUIRED',
        columnMapping: mapping,
        errorMessage: `Required fields not mapped: ${missingRequired.join(', ')}`,
      });
      return;
    }

    // Build header-index lookup for fast row extraction
    const headerIndex = new Map(headers.map((h, i) => [h, i]));

    // Build canonical-field → csv-header lookup from the confirmed mapping
    const canonicalToHeader = new Map<string, string>();
    for (const [header, canonical] of Object.entries(mapping)) {
      if (canonical) canonicalToHeader.set(canonical, header);
    }

    // Validate each data row
    let rowsProcessed = 0;
    let rowsFailed = 0;
    const processingErrors: { row: number; message: string }[] = [];

    if (record.ingestionType === 'OTHER') {
      // No schema for OTHER — every row passes by definition
      rowsProcessed = rows.length;
    } else {
      for (let i = 0; i < rows.length; i++) {
        const rawRow = rows[i];

        // Map raw values to their canonical names
        const rowValues: Record<string, string> = {};
        for (const field of getSchemaFields(record.ingestionType)) {
          const header = canonicalToHeader.get(field.name);
          if (header !== undefined) {
            const idx = headerIndex.get(header) ?? -1;
            rowValues[field.name] = idx >= 0 ? (rawRow[idx] ?? '') : '';
          }
        }

        const { valid, errors } = validateRow(rowValues, record.ingestionType);
        if (valid) {
          rowsProcessed++;
        } else {
          rowsFailed++;
          if (processingErrors.length < MAX_PROCESSING_ERRORS) {
            processingErrors.push({ row: i + 2, message: errors.join('; ') });
          }
        }
      }
    }

    const finalStatus = rowsProcessed > 0 ? 'COMPLETE' : 'FAILED';

    await CsvIngestionModel.findByIdAndUpdate(ingestionId, {
      status: finalStatus,
      columnMapping: mapping,
      rowsProcessed,
      rowsFailed,
      processingErrors,
      errorMessage:
        finalStatus === 'FAILED'
          ? 'All rows failed validation — see processingErrors for details'
          : null,
    });

    await writeAuditEvent({
      actorUserId: record.uploadedByUserId,
      orgId: record.orgId,
      action: 'CSV_PROCESSED',
      entityType: 'CsvIngestion',
      entityId: record._id,
      source: 'system',
      updateType: 'system_generated',
      diff: {
        before: { status: 'PROCESSING' },
        after: { status: finalStatus, rowsProcessed, rowsFailed },
      },
    });
  } catch (err) {
    console.error(`[CSV_PROCESSOR] Unexpected error for ${ingestionId}:`, err);
    await CsvIngestionModel.findByIdAndUpdate(ingestionId, {
      status: 'FAILED',
      errorMessage: err instanceof Error ? err.message : 'Unexpected processing error',
    });
  }
}
