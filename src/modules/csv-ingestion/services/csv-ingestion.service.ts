import crypto from 'crypto';
import { Types } from 'mongoose';
import { storage } from '../../docs/storage';
import { writeAuditEvent } from '../../audit/services/audit.service';
import {
  CsvIngestionModel,
  CsvIngestionType,
  ICsvIngestion,
} from '../models/csv-ingestion.model';
import { runProcessing } from './csv-processor.service';

const CSV_KEY_PREFIX = process.env.AWS_S3_CSV_PREFIX || 'csv';

/**
 * Count data rows in a CSV buffer (excludes the header row).
 * Strips blank lines so trailing newlines don't inflate the count.
 */
function countCsvRows(buffer: Buffer): number {
  const lines = buffer
    .toString('utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  // lines[0] is the header; everything after is data
  return Math.max(0, lines.length - 1);
}

interface UploadCsvParams {
  orgId: Types.ObjectId;
  uploadedByUserId: Types.ObjectId;
  buffer: Buffer;
  originalFileName: string;
  mimeType: string;
  ingestionType: CsvIngestionType;
}

export async function uploadCsvAndCreateRecord(
  params: UploadCsvParams
): Promise<ICsvIngestion> {
  const { orgId, uploadedByUserId, buffer, originalFileName, mimeType, ingestionType } =
    params;

  const safeName = originalFileName.replace(/\s+/g, '-');
  const key = `${CSV_KEY_PREFIX}/${orgId.toString()}/${crypto.randomUUID()}_${safeName}`;

  const { publicUrl: fileUrl } = await storage.put(key, buffer, mimeType);

  const rowCount = countCsvRows(buffer);

  const record = await CsvIngestionModel.create({
    orgId,
    uploadedByUserId,
    originalFileName,
    s3Key: key,
    fileUrl,
    fileSizeBytes: buffer.byteLength,
    mimeType,
    ingestionType,
    status: 'PENDING',
    rowCount,
  });

  await writeAuditEvent({
    actorUserId: uploadedByUserId,
    orgId,
    action: 'CSV_UPLOADED',
    entityType: 'CsvIngestion',
    entityId: record._id,
    diff: {
      before: null,
      after: {
        originalFileName,
        ingestionType,
        rowCount,
        fileSizeBytes: buffer.byteLength,
      },
    },
  });

  // BE-111: Fire-and-forget the real column mapping + validation engine.
  runProcessing(record._id.toString()).catch((err) =>
    console.error('[CSV_JOB_ERROR]', err)
  );

  return record;
}

export async function listIngestionsByOrg(
  orgId: Types.ObjectId,
  filters?: {
    status?: string;
    ingestionType?: string;
    limit?: number;
  }
): Promise<ICsvIngestion[]> {
  const query: Record<string, unknown> = { orgId };

  if (filters?.status) query.status = filters.status;
  if (filters?.ingestionType) query.ingestionType = filters.ingestionType;

  const limit = Math.min(filters?.limit ?? 50, 100);

  return CsvIngestionModel.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean() as Promise<ICsvIngestion[]>;
}

export async function getIngestionById(
  ingestionId: string,
  orgId: Types.ObjectId
): Promise<ICsvIngestion | null> {
  if (!Types.ObjectId.isValid(ingestionId)) return null;
  return CsvIngestionModel.findOne({
    _id: ingestionId,
    orgId,
  }).lean() as Promise<ICsvIngestion | null>;
}
