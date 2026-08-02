import type { CsvImportSummary, CsvValidationResult } from '../types/csvImport.types';
import type { CsvImportSummaryBody } from '../dto/csvImport.dto';

export function buildImportSummary(validation: CsvValidationResult): CsvImportSummary {
  const valid = validation.validRows.length;
  const e = validation.errors;
  const w = validation.warnings;
  return {
    totalRows: validation.totalDataRows,
    valid,
    invalidRowCount: Math.max(0, validation.totalDataRows - valid),
    errors: e,
    warnings: w,
    errorCount: e.length,
    warningCount: w.length,
  };
}

export function buildImportSummaryFromPayload(validation: CsvImportSummaryBody): CsvImportSummary {
  const valid = validation.validRows.length;
  const e = validation.errors;
  const w = validation.warnings;
  return {
    totalRows: validation.totalDataRows,
    valid,
    invalidRowCount: Math.max(0, validation.totalDataRows - valid),
    errors: e,
    warnings: w,
    errorCount: e.length,
    warningCount: w.length,
  };
}
