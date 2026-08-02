import mongoose, { Schema, Document, Types } from 'mongoose';

export type CsvIngestionType =
  | 'TENANT'
  | 'PROPERTY'
  | 'UNIT'
  | 'PAYMENT'
  | 'LEASE'
  | 'OTHER';

export type CsvIngestionStatus =
  | 'PENDING'
  | 'MAPPING_REQUIRED'
  | 'PROCESSING'
  | 'COMPLETE'
  | 'FAILED';

/**
 * Import source (Laurel Q8: "whether data comes from a PMS API, CSV upload,
 * Excel file, rent roll, lease agreement upload, or manual entry, it should
 * flow through the same import pipeline"). CSV_UPLOAD is the only implemented
 * connector today; PMS_* entries exist so the activation-flow UI can render
 * them as "Coming Soon" without a backend redesign when they're built.
 */
export type ImportSource =
  | 'CSV_UPLOAD'
  | 'EXCEL_UPLOAD'
  | 'MANUAL_ENTRY'
  | 'PMS_APPFOLIO'
  | 'PMS_YARDI'
  | 'PMS_BUILDIUM'
  | 'PMS_REALPAGE'
  | 'PMS_ENTRATA'
  | 'PMS_MRI';

export type PersistStatus = 'NOT_STARTED' | 'PERSISTING' | 'PERSISTED' | 'PERSIST_FAILED';

export interface IPersistResult {
  row: number;
  email: string;
  status: 'CREATED' | 'SKIPPED' | 'ERROR';
  message?: string;
}

export interface ICsvIngestion extends Document {
  _id: Types.ObjectId;
  orgId: Types.ObjectId;
  uploadedByUserId: Types.ObjectId;
  originalFileName: string;
  s3Key: string;
  fileUrl: string;
  fileSizeBytes: number;
  mimeType: string;
  ingestionType: CsvIngestionType;
  /** Defaults to CSV_UPLOAD for backward compatibility with existing records. */
  source: ImportSource;
  status: CsvIngestionStatus;
  rowCount: number | null;
  errorMessage?: string | null;
  columnMapping: Record<string, string | null> | null;
  rowsProcessed: number;
  rowsFailed: number;
  processingErrors: Array<{ row: number; message: string }>;
  /** Persist stage — only used for ingestionType TENANT today. */
  persistStatus: PersistStatus;
  persistResults: IPersistResult[];
  tenantsCreated: number;
  createdAt: Date;
  updatedAt: Date;
}

const CsvIngestionSchema = new Schema<ICsvIngestion>(
  {
    orgId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    uploadedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    originalFileName: {
      type: String,
      required: true,
      trim: true,
    },
    s3Key: {
      type: String,
      required: true,
      unique: true,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    fileSizeBytes: {
      type: Number,
      required: true,
      min: 0,
    },
    mimeType: {
      type: String,
      required: true,
    },
    ingestionType: {
      type: String,
      required: true,
      enum: ['TENANT', 'PROPERTY', 'UNIT', 'PAYMENT', 'LEASE', 'OTHER'],
      index: true,
    },
    source: {
      type: String,
      enum: [
        'CSV_UPLOAD', 'EXCEL_UPLOAD', 'MANUAL_ENTRY',
        'PMS_APPFOLIO', 'PMS_YARDI', 'PMS_BUILDIUM', 'PMS_REALPAGE', 'PMS_ENTRATA', 'PMS_MRI',
      ],
      default: 'CSV_UPLOAD',
    },
    status: {
      type: String,
      required: true,
      enum: ['PENDING', 'MAPPING_REQUIRED', 'PROCESSING', 'COMPLETE', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    rowCount: {
      type: Number,
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    columnMapping: {
      type: Schema.Types.Mixed,
      default: null,
    },
    rowsProcessed: {
      type: Number,
      default: 0,
    },
    rowsFailed: {
      type: Number,
      default: 0,
    },
    processingErrors: {
      type: [
        {
          row: { type: Number, required: true },
          message: { type: String, required: true },
          _id: false,
        },
      ],
      default: [],
    },
    persistStatus: {
      type: String,
      enum: ['NOT_STARTED', 'PERSISTING', 'PERSISTED', 'PERSIST_FAILED'],
      default: 'NOT_STARTED',
    },
    persistResults: {
      type: [
        {
          row: { type: Number, required: true },
          email: { type: String, required: true },
          status: { type: String, enum: ['CREATED', 'SKIPPED', 'ERROR'], required: true },
          message: { type: String },
          _id: false,
        },
      ],
      default: [],
    },
    tenantsCreated: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: 'csv_ingestions',
  }
);

CsvIngestionSchema.index({ orgId: 1, status: 1, createdAt: -1 });
CsvIngestionSchema.index({ orgId: 1, ingestionType: 1, createdAt: -1 });
CsvIngestionSchema.index({ uploadedByUserId: 1, createdAt: -1 });

export const CsvIngestionModel = mongoose.model<ICsvIngestion>(
  'CsvIngestion',
  CsvIngestionSchema
);
