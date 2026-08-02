import { mergeLayers, PLATFORM_DEFAULTS } from './programConfig.service';

describe('program-config mergeLayers (Org → Property → Unit → Tenant inheritance)', () => {
  it('no layers = platform defaults', () => {
    const r = mergeLayers([]);
    expect(r.programType).toBe(PLATFORM_DEFAULTS.programType);
    expect(r.rewardRules.onTimeRentPoints).toBe(PLATFORM_DEFAULTS.rewardRules.onTimeRentPoints);
    expect(r.provenance.programType).toBe('PLATFORM');
  });

  it('property layer overrides org layer', () => {
    const r = mergeLayers([
      { scope: 'ORG', programType: 'RPA_ONLY' },
      { scope: 'PROPERTY', programType: 'BOTH' },
    ]);
    expect(r.programType).toBe('BOTH');
    expect(r.provenance.programType).toBe('PROPERTY');
  });

  it('unset fields inherit from parent (field-level merge)', () => {
    const r = mergeLayers([
      { scope: 'ORG', rewardRules: { onTimeRentPoints: 200, renewalPoints: 900 } },
      { scope: 'PROPERTY', rewardRules: { onTimeRentPoints: 300 } }, // renewalPoints not set
    ]);
    expect(r.rewardRules.onTimeRentPoints).toBe(300);   // property override
    expect(r.rewardRules.renewalPoints).toBe(900);      // inherited from org
    expect(r.provenance['rewardRules.onTimeRentPoints']).toBe('PROPERTY');
    expect(r.provenance['rewardRules.renewalPoints']).toBe('ORG');
  });

  it('tenant layer wins over everything (4-level chain)', () => {
    const r = mergeLayers([
      { scope: 'ORG', programType: 'RPA_ONLY', tokenRules: { monthlyAccrualTokens: 5 } },
      { scope: 'PROPERTY', programType: 'BOTH', tokenRules: { monthlyAccrualTokens: 10 } },
      { scope: 'UNIT', tokenRules: { monthlyAccrualTokens: 20 } },
      { scope: 'TENANT', tokenRules: { monthlyAccrualTokens: 25 } },
    ]);
    expect(r.programType).toBe('BOTH'); // property set it; unit/tenant didn't
    expect(r.tokenRules.monthlyAccrualTokens).toBe(25);
    expect(r.provenance['tokenRules.monthlyAccrualTokens']).toBe('TENANT');
  });

  it('null values inherit (do not override)', () => {
    const r = mergeLayers([
      { scope: 'ORG', programType: 'TEPA_ONLY' },
      { scope: 'PROPERTY', programType: null },
    ]);
    expect(r.programType).toBe('TEPA_ONLY');
    expect(r.provenance.programType).toBe('ORG');
  });

  it('programType drives default enablement of reward/token rules', () => {
    const rpa = mergeLayers([{ scope: 'PROPERTY', programType: 'RPA_ONLY' }]);
    expect(rpa.rewardRules.enabled).toBe(true);
    expect(rpa.tokenRules.enabled).toBe(false);

    const tepa = mergeLayers([{ scope: 'PROPERTY', programType: 'TEPA_ONLY' }]);
    expect(tepa.rewardRules.enabled).toBe(false);
    expect(tepa.tokenRules.enabled).toBe(true);

    const both = mergeLayers([{ scope: 'PROPERTY', programType: 'BOTH' }]);
    expect(both.rewardRules.enabled).toBe(true);
    expect(both.tokenRules.enabled).toBe(true);

    const none = mergeLayers([{ scope: 'PROPERTY', programType: 'NONE' }]);
    expect(none.rewardRules.enabled).toBe(false);
    expect(none.tokenRules.enabled).toBe(false);
  });

  it('explicit enabled flag beats programType-derived enablement', () => {
    const r = mergeLayers([
      { scope: 'PROPERTY', programType: 'RPA_ONLY', tokenRules: { enabled: true } },
    ]);
    expect(r.tokenRules.enabled).toBe(true); // explicitly enabled despite RPA_ONLY
  });
});
