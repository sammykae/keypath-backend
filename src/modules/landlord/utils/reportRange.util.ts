export type ReportRangeLabel = 'LAST_30_DAYS' | 'LAST_90_DAYS' | 'THIS_YEAR';

export interface ReportRange {
  label: ReportRangeLabel;
  /** Trailing window start (for backward-looking trends like NOI/occupancy history). */
  from: Date;
  to: Date;
  /** Window size in days — reused as the forward-looking horizon for exposure-style charts (e.g. leases expiring in the next N days), since the ticket applies the same 3 filters to both trailing and forward-looking report areas. */
  days: number;
}

/** Accepts the ticket's UI labels (Last 30 Days / Last 90 Days / This Year) in any of a few reasonable
 * query-string encodings (`30d`, `last30days`, `LAST_30_DAYS`, etc). Defaults to This Year. */
export function parseReportRange(range?: string): ReportRange {
  const now = new Date();
  const normalized = (range ?? '').toLowerCase().replace(/[\s_-]/g, '');

  if (normalized === '30d' || normalized === 'last30days') {
    return { label: 'LAST_30_DAYS', from: daysAgo(now, 30), to: now, days: 30 };
  }
  if (normalized === '90d' || normalized === 'last90days') {
    return { label: 'LAST_90_DAYS', from: daysAgo(now, 90), to: now, days: 90 };
  }
  if (normalized === '1y' || normalized === 'thisyear') {
    return thisYearRange(now);
  }
  return thisYearRange(now);
}

function thisYearRange(now: Date): ReportRange {
  const from = new Date(now.getFullYear(), 0, 1);
  const days = Math.max(1, Math.round((now.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
  return { label: 'THIS_YEAR', from, to: now, days };
}

function daysAgo(now: Date, n: number): Date {
  return new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
}

/** YYYY-MM keys (inclusive) covering a date range, oldest first — matches UnitFinancialsModel.month format. */
export function monthKeysInRange(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  while (cursor <= end) {
    keys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}
