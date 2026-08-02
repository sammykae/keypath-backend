import { z } from 'zod';
import { CsvImportSchema } from '../types/csvImport.types';

const CsvColumnFormat = z.enum(['string', 'email', 'number', 'integer', 'date_iso', 'objectid']);

const CsvColumnRuleSchema = z
  .object({
    format: CsvColumnFormat.optional(),
    required: z.boolean().optional(),
  })
  .strict();

export const CsvImportSchemaZod: z.ZodType<CsvImportSchema> = z
  .object({
    required: z.array(z.string().min(1)).default([]),
    columns: z.record(z.string().min(1), CsvColumnRuleSchema).optional(),
    duplicateKeyColumns: z.array(z.string().min(1)).default([]),
    duplicateEntireRow: z.boolean().optional().default(false),
    caseInsensitiveHeaders: z.boolean().optional().default(true),
    allowUnknownHeaders: z.boolean().optional().default(true),
  })
  .strict();

export const CsvValidateBody = z
  .object({
    csv: z.string().min(1, 'csv content required'),
    schema: CsvImportSchemaZod,
  })
  .strict();

const CsvFileIssueZod = z
  .object({
    code: z.string(),
    message: z.string(),
    row: z.number().int().min(0),
    field: z.string().optional(),
    value: z.string().optional(),
  })
  .strict();

export const CsvImportSummaryBody = z
  .object({
    validRows: z.array(z.record(z.string(), z.string())).default([]),
    errors: z.array(CsvFileIssueZod).default([]),
    warnings: z.array(CsvFileIssueZod).default([]),
    totalDataRows: z.number().int().min(0),
    headerRowNumber: z.number().int().min(0).default(1),
    resolvedHeaders: z.array(z.string()).default([]),
  })
  .strict();

export type CsvValidateBody = z.infer<typeof CsvValidateBody>;
export type CsvImportSummaryBody = z.infer<typeof CsvImportSummaryBody>;
