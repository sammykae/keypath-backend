import { computeVesting } from './vesting.service';

const monthsAgo = (n: number) => new Date(Date.now() - n * 30.44 * 24 * 60 * 60 * 1000);

describe('computeVesting (time-based monthly vesting)', () => {
  it('accrual older than vestingMonths is vested', () => {
    const r = computeVesting(
      [{ type: 'accrual', tokens: 10, timestamp: monthsAgo(13) }],
      12
    );
    expect(r).toEqual({ totalTokens: 10, vestedTokens: 10, unvestedTokens: 0 });
  });

  it('recent accrual is unvested', () => {
    const r = computeVesting(
      [{ type: 'accrual', tokens: 10, timestamp: monthsAgo(2) }],
      12
    );
    expect(r).toEqual({ totalTokens: 10, vestedTokens: 0, unvestedTokens: 10 });
  });

  it('purchases vest immediately regardless of age', () => {
    const r = computeVesting(
      [{ type: 'purchase', tokens: 50, timestamp: monthsAgo(0) }],
      12
    );
    expect(r.vestedTokens).toBe(50);
    expect(r.unvestedTokens).toBe(0);
  });

  it('mixed ledger splits correctly', () => {
    const r = computeVesting(
      [
        { type: 'accrual', tokens: 10, timestamp: monthsAgo(14) }, // vested
        { type: 'accrual', tokens: 10, timestamp: monthsAgo(6) },  // unvested
        { type: 'purchase', tokens: 5, timestamp: monthsAgo(1) },  // vested
      ],
      12
    );
    expect(r).toEqual({ totalTokens: 25, vestedTokens: 15, unvestedTokens: 10 });
  });

  it('vestingMonths = 0 vests accruals immediately', () => {
    const r = computeVesting(
      [{ type: 'accrual', tokens: 10, timestamp: monthsAgo(0) }],
      0
    );
    expect(r.vestedTokens).toBe(10);
  });

  it('negative entries consume unvested pool first', () => {
    const r = computeVesting(
      [
        { type: 'accrual', tokens: 10, timestamp: monthsAgo(14) }, // vested
        { type: 'accrual', tokens: 10, timestamp: monthsAgo(1) },  // unvested
        { type: 'forfeit', tokens: -6, timestamp: monthsAgo(0) },
      ],
      12
    );
    expect(r.unvestedTokens).toBe(4);  // 10 - 6
    expect(r.vestedTokens).toBe(10);   // untouched
  });

  it('negatives overflow into vested pool after unvested is exhausted', () => {
    const r = computeVesting(
      [
        { type: 'accrual', tokens: 10, timestamp: monthsAgo(14) }, // vested
        { type: 'accrual', tokens: 5, timestamp: monthsAgo(1) },   // unvested
        { type: 'approved_deduction', tokens: -8, timestamp: monthsAgo(0) },
      ],
      12
    );
    expect(r.unvestedTokens).toBe(0);
    expect(r.vestedTokens).toBe(7); // 10 - (8 - 5)
  });

  it('empty ledger = zeros', () => {
    expect(computeVesting([], 12)).toEqual({ totalTokens: 0, vestedTokens: 0, unvestedTokens: 0 });
  });

  it('spot purchases vest immediately regardless of age', () => {
    const r = computeVesting(
      [{ type: 'spot_purchase', tokens: 20, timestamp: monthsAgo(0) }],
      12
    );
    expect(r).toEqual({ totalTokens: 20, vestedTokens: 20, unvestedTokens: 0 });
  });

  it('incentive tokens vest immediately regardless of age', () => {
    const r = computeVesting(
      [{ type: 'incentive_token', tokens: 15, timestamp: monthsAgo(0) }],
      12
    );
    expect(r).toEqual({ totalTokens: 15, vestedTokens: 15, unvestedTokens: 0 });
  });
});
