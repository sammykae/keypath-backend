import { parse } from 'csv-parse/sync';
import type { CsvColumnFormat, CsvFileIssue, CsvImportSchema, CsvValidationResult } from '../types/csvImport.types';

const HEADER_LINE = 1;
const firstDataLine = 2;

function n(s: string, ci: boolean): string {
  const t = s.trim();
  return ci ? t.toLowerCase() : t;
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function isObjectId(s: string): boolean {
  return /^[a-fA-F0-9]{24}$/.test(s.trim());
}

function checkFormat(
  value: string,
  format: CsvColumnFormat,
  allowEmpty: boolean
): { ok: boolean; message?: string } {
  const v = value.trim();
  if (v === '' && allowEmpty) return { ok: true };
  if (v === '' && !allowEmpty) return { ok: false, message: 'value is empty' };
  switch (format) {
    case 'string':
      return { ok: true };
    case 'email':
      return isEmail(v) ? { ok: true } : { ok: false, message: 'invalid email' };
    case 'number': {
      const x = Number(v);
      return Number.isFinite(x) ? { ok: true } : { ok: false, message: 'not a number' };
    }
    case 'integer': {
      const x = Number(v);
      return Number.isFinite(x) && Math.floor(x) === x ? { ok: true } : { ok: false, message: 'not an integer' };
    }
    case 'date_iso':
      return !Number.isNaN(Date.parse(v)) ? { ok: true } : { ok: false, message: 'invalid date' };
    case 'objectid':
      return isObjectId(v) ? { ok: true } : { ok: false, message: 'invalid object id' };
    default:
      return { ok: true };
  }
}

function rowsToObjects(header: string[], dataRows: string[][]): Record<string, string>[] {
  return dataRows.map((row) => {
    const o: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) {
      o[header[i]!] = row[i] != null && row[i] !== undefined ? String(row[i]) : '';
    }
    return o;
  });
}

export function validateCsvString(csv: string, schema: CsvImportSchema): CsvValidationResult {
  const errors: CsvFileIssue[] = [];
  const warnings: CsvFileIssue[] = [];
  const ci = schema.caseInsensitiveHeaders !== false;
  const allowUnknown = schema.allowUnknownHeaders !== false;
  const columns = schema.columns ?? {};
  const dupCols = schema.duplicateKeyColumns ?? [];
  const required = schema.required ?? [];

  let rows2d: string[][];
  try {
    rows2d = parse(csv, {
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_column_count: true,
      relax_quotes: true,
    }) as string[][];
  } catch (e) {
    return {
      validRows: [],
      errors: [
        {
          code: 'PARSE_ERROR',
          message: e instanceof Error ? e.message : 'parse failed',
          row: 0,
        },
      ],
      warnings,
      totalDataRows: 0,
      headerRowNumber: HEADER_LINE,
      resolvedHeaders: [],
    };
  }

  if (rows2d.length === 0) {
    return {
      validRows: [],
      errors: [{ code: 'EMPTY_CSV', message: 'file is empty', row: 0 }],
      warnings,
      totalDataRows: 0,
      headerRowNumber: HEADER_LINE,
      resolvedHeaders: [],
    };
  }

  const rawHeader = rows2d[0]!.map((h) => h.trim());
  const seenH = new Set<string>();
  for (let i = 0; i < rawHeader.length; i++) {
    const k = n(rawHeader[i]!, ci);
    if (seenH.has(k)) {
      errors.push({
        code: 'DUPLICATE_HEADER',
        message: `duplicate column name: ${rawHeader[i]}`,
        field: rawHeader[i],
        row: HEADER_LINE,
      });
    }
    seenH.add(k);
  }

  const schemaFieldNorms = new Set(
    [
      ...required,
      ...Object.keys(columns),
      ...dupCols,
    ].map((f) => n(f, ci))
  );

  for (const h of rawHeader) {
    const inSchema = schemaFieldNorms.has(n(h, ci));
    if (!inSchema) {
      if (allowUnknown) {
        warnings.push({ code: 'UNKNOWN_FIELD', message: `unmapped column ignored: ${h}`, field: h, row: HEADER_LINE });
      } else {
        errors.push({ code: 'UNKNOWN_FIELD', message: `header not in schema: ${h}`, field: h, row: HEADER_LINE });
      }
    }
  }

  for (const req of required) {
    if (!rawHeader.some((h) => n(h, ci) === n(req, ci))) {
      errors.push({
        code: 'MISSING_FIELD',
        message: `column missing: ${req}`,
        field: req,
        row: HEADER_LINE,
      });
    }
  }
  for (const [col, rule] of Object.entries(columns)) {
    if (rule.required && !rawHeader.some((h) => n(h, ci) === n(col, ci))) {
      errors.push({ code: 'MISSING_FIELD', message: `column missing: ${col}`, field: col, row: HEADER_LINE });
    }
  }
  for (const d of dupCols) {
    if (!rawHeader.some((h) => n(h, ci) === n(d, ci))) {
      errors.push({ code: 'MISSING_FIELD', message: `duplicate key column not in file: ${d}`, field: d, row: HEADER_LINE });
    }
  }

  const dataRows2d = rows2d.slice(1);
  const dataRows = rowsToObjects(rawHeader, dataRows2d);
  const totalDataRows = dataRows.length;
  const validRows: Record<string, string>[] = [];

  function fileValue(row: Record<string, string>, logical: string): string {
    const key = rawHeader.find((h) => n(h, ci) === n(logical, ci)) ?? '';
    if (!key) return '';
    return (row[key] ?? '').toString();
  }

  function logicalObject(row: Record<string, string>): Record<string, string> {
    const o: Record<string, string> = {};
    for (const h of rawHeader) {
      o[n(h, true)] = (row[h] ?? '').toString();
    }
    return o;
  }

  const seen = new Map<string, number>();

  for (let i = 0; i < dataRows.length; i++) {
    const lineRow = i + firstDataLine;
    const row = dataRows[i]!;
    let rowHasError = false;
    const fail = (issue: Omit<CsvFileIssue, 'row'> & { row?: number }): void => {
      errors.push({ ...issue, row: lineRow } as CsvFileIssue);
      rowHasError = true;
    };

    for (const req of required) {
      if (fileValue(row, req).trim() === '') {
        fail({ code: 'REQUIRED_VALUE', message: 'required field empty', field: req });
      }
    }

    for (const [col, rule] of Object.entries(columns)) {
      if (!rule.required) continue;
      if (!rawHeader.some((h) => n(h, ci) === n(col, ci))) continue;
      if (required.some((r) => n(r, ci) === n(col, ci))) continue;
      if (fileValue(row, col).trim() === '') {
        fail({ code: 'REQUIRED_VALUE', message: 'required field empty', field: col });
      }
    }

    for (const [col, rule] of Object.entries(columns)) {
      if (!rawHeader.some((h) => n(h, ci) === n(col, ci))) continue;
      const v = fileValue(row, col);
      if (v.trim() === '' && !rule.required) continue;
      if (v.trim() === '' && rule.required) continue;
      const fmt = (rule.format ?? 'string') as CsvColumnFormat;
      const chk = checkFormat(v, fmt, !rule.required && v.trim() === '');
      if (!chk.ok) {
        fail({ code: 'INVALID_FORMAT', message: chk.message ?? 'invalid', field: col, value: v });
      }
    }

    if (dupCols.length) {
      const parts = dupCols.map((dk) => fileValue(row, dk).trim());
      if (parts.every((p) => p.length > 0)) {
        const ckey = parts.join('\u0001');
        if (seen.has(ckey)) {
          fail({
            code: 'DUPLICATE',
            message: `duplicate of row ${seen.get(ckey)}`,
            value: ckey,
          });
        } else {
          seen.set(ckey, lineRow);
        }
      }
    } else if (schema.duplicateEntireRow) {
      const parts = rawHeader.map((h) => fileValue(row, h).trim());
      const ckey = parts.join('\u0001');
      if (seen.has(ckey)) {
        fail({
          code: 'DUPLICATE',
          message: `duplicate of row ${seen.get(ckey)}`,
          value: ckey,
        });
      } else {
        seen.set(ckey, lineRow);
      }
    }

    if (!rowHasError) {
      validRows.push(logicalObject(row));
    }
  }

  return {
    validRows,
    errors,
    warnings,
    totalDataRows,
    headerRowNumber: HEADER_LINE,
    resolvedHeaders: rawHeader,
  };
}
