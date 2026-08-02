export interface CsvFileIssue {
  code: string;
  message: string;
  row: number;
  field?: string;
  value?: string;
}

export type CsvColumnFormat = 'string' | 'email' | 'number' | 'integer' | 'date_iso' | 'objectid';

export interface CsvColumnRule {
  format?: CsvColumnFormat;
  required?: boolean;
}

export interface CsvImportSchema {
  required: string[];
  columns?: Record<string, CsvColumnRule>;
  duplicateKeyColumns?: string[];
  /**
   * If true and `duplicateKeyColumns` is empty, two identical data rows (all column values) are a duplicate.
   * If `duplicateKeyColumns` is non-empty, that list is used and this flag is ignored.
   */
  duplicateEntireRow?: boolean;
  caseInsensitiveHeaders?: boolean;
  allowUnknownHeaders?: boolean;
}

export interface CsvValidationResult {
  validRows: Record<string, string>[];
  errors: CsvFileIssue[];
  warnings: CsvFileIssue[];
  totalDataRows: number;
  headerRowNumber: number;
  resolvedHeaders: string[];
}

/**
 * BE-309: `totalRows`, the `errors` and `warnings` issue lists, and `valid` row count — same shapes as `CsvValidationResult` plus rollups.
 */
export interface CsvImportSummary {
  totalRows: number;
  valid: number;
  invalidRowCount: number;
  errors: CsvFileIssue[];
  warnings: CsvFileIssue[];
  errorCount: number;
  warningCount: number;
}
