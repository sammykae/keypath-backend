import { parseReportRange, monthKeysInRange } from './reportRange.util';

describe('parseReportRange', () => {
  it('parses "30d" as LAST_30_DAYS with a 30-day trailing window', () => {
    const r = parseReportRange('30d');
    expect(r.label).toBe('LAST_30_DAYS');
    expect(r.days).toBe(30);
    expect(r.to.getTime() - r.from.getTime()).toBeCloseTo(30 * 24 * 60 * 60 * 1000, -3);
  });

  it('parses "last30days" (case/spacing-insensitive) the same as "30d"', () => {
    expect(parseReportRange('Last 30 Days').label).toBe('LAST_30_DAYS');
    expect(parseReportRange('LAST_30_DAYS').label).toBe('LAST_30_DAYS');
  });

  it('parses "90d" / "last90days" as LAST_90_DAYS', () => {
    expect(parseReportRange('90d').label).toBe('LAST_90_DAYS');
    expect(parseReportRange('last90days').days).toBe(90);
  });

  it('parses "1y" / "thisyear" as THIS_YEAR, anchored to Jan 1 of the current year', () => {
    const r = parseReportRange('1y');
    expect(r.label).toBe('THIS_YEAR');
    expect(r.from.getMonth()).toBe(0);
    expect(r.from.getDate()).toBe(1);
  });

  it('defaults to THIS_YEAR when no range is given', () => {
    expect(parseReportRange(undefined).label).toBe('THIS_YEAR');
  });

  it('defaults to THIS_YEAR for an unrecognized value rather than throwing', () => {
    expect(parseReportRange('garbage').label).toBe('THIS_YEAR');
  });
});

describe('monthKeysInRange', () => {
  it('returns inclusive YYYY-MM keys spanning the range, oldest first', () => {
    const from = new Date(2026, 0, 15); // Jan 15 2026
    const to = new Date(2026, 2, 5); // Mar 5 2026
    expect(monthKeysInRange(from, to)).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('returns a single key when from/to fall in the same month', () => {
    const from = new Date(2026, 5, 1);
    const to = new Date(2026, 5, 28);
    expect(monthKeysInRange(from, to)).toEqual(['2026-06']);
  });
});
