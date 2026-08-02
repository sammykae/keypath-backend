import { computeStatus } from './goodStanding.service';

describe('Good Standing computeStatus', () => {
  const base = { arrearsDays: 0, activeFlagTypes: [] as any[], tenancyStatus: 'ACTIVE', override: null };

  it('rent current + no flags = ACTIVE', () => {
    const r = computeStatus(base);
    expect(r.status).toBe('ACTIVE');
    expect(r.overridden).toBe(false);
    expect(r.reasons).toContain('Rent current, no active flags');
  });

  it('1-30 days late = AT_RISK', () => {
    expect(computeStatus({ ...base, arrearsDays: 1 }).status).toBe('AT_RISK');
    expect(computeStatus({ ...base, arrearsDays: 30 }).status).toBe('AT_RISK');
  });

  it('31-90 days late = PAUSED', () => {
    expect(computeStatus({ ...base, arrearsDays: 31 }).status).toBe('PAUSED');
    expect(computeStatus({ ...base, arrearsDays: 90 }).status).toBe('PAUSED');
  });

  it('91+ days late = SUSPENDED', () => {
    expect(computeStatus({ ...base, arrearsDays: 91 }).status).toBe('SUSPENDED');
    expect(computeStatus({ ...base, arrearsDays: 400 }).status).toBe('SUSPENDED');
  });

  it('flag severity maps correctly', () => {
    expect(computeStatus({ ...base, activeFlagTypes: ['EVICTION'] }).status).toBe('SUSPENDED');
    expect(computeStatus({ ...base, activeFlagTypes: ['FRAUD'] }).status).toBe('SUSPENDED');
    expect(computeStatus({ ...base, activeFlagTypes: ['LEASE_VIOLATION'] }).status).toBe('PAUSED');
    expect(computeStatus({ ...base, activeFlagTypes: ['DAMAGE_CLAIM'] }).status).toBe('AT_RISK');
    expect(computeStatus({ ...base, activeFlagTypes: ['OTHER'] }).status).toBe('AT_RISK');
  });

  it('highest severity wins when multiple inputs apply', () => {
    const r = computeStatus({
      ...base,
      arrearsDays: 15,                       // AT_RISK
      activeFlagTypes: ['LEASE_VIOLATION'],  // PAUSED
    });
    expect(r.status).toBe('PAUSED');
    expect(r.reasons.length).toBe(2);
  });

  it('terminated tenancy = SUSPENDED regardless of rent', () => {
    const r = computeStatus({ ...base, tenancyStatus: 'TERMINATED' });
    expect(r.status).toBe('SUSPENDED');
  });

  it('admin override wins over everything', () => {
    const r = computeStatus({
      ...base,
      arrearsDays: 120,                 // would be SUSPENDED
      activeFlagTypes: ['EVICTION'],    // would be SUSPENDED
      override: { status: 'ACTIVE', reason: 'payment plan agreed' },
    });
    expect(r.status).toBe('ACTIVE');
    expect(r.overridden).toBe(true);
    expect(r.reasons[0]).toContain('payment plan agreed');
  });

  it('override can also downgrade', () => {
    const r = computeStatus({ ...base, override: { status: 'SUSPENDED', reason: 'fraud investigation' } });
    expect(r.status).toBe('SUSPENDED');
    expect(r.overridden).toBe(true);
  });
});
