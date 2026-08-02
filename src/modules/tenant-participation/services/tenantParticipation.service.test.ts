import { isParticipationTypeAllowed } from './tenantParticipation.service';

describe('isParticipationTypeAllowed', () => {
  it('NONE property allows only NONE participation', () => {
    expect(isParticipationTypeAllowed('NONE', 'NONE')).toBe(true);
    expect(isParticipationTypeAllowed('NONE', 'RPA_ONLY')).toBe(false);
    expect(isParticipationTypeAllowed('NONE', 'TEPA_ONLY')).toBe(false);
    expect(isParticipationTypeAllowed('NONE', 'BOTH')).toBe(false);
  });

  it('RPA_ONLY property allows NONE or RPA_ONLY', () => {
    expect(isParticipationTypeAllowed('RPA_ONLY', 'NONE')).toBe(true);
    expect(isParticipationTypeAllowed('RPA_ONLY', 'RPA_ONLY')).toBe(true);
    expect(isParticipationTypeAllowed('RPA_ONLY', 'TEPA_ONLY')).toBe(false);
    expect(isParticipationTypeAllowed('RPA_ONLY', 'BOTH')).toBe(false);
  });

  it('TEPA_ONLY property allows NONE or TEPA_ONLY', () => {
    expect(isParticipationTypeAllowed('TEPA_ONLY', 'NONE')).toBe(true);
    expect(isParticipationTypeAllowed('TEPA_ONLY', 'TEPA_ONLY')).toBe(true);
    expect(isParticipationTypeAllowed('TEPA_ONLY', 'RPA_ONLY')).toBe(false);
    expect(isParticipationTypeAllowed('TEPA_ONLY', 'BOTH')).toBe(false);
  });

  it('BOTH property allows any participation type', () => {
    expect(isParticipationTypeAllowed('BOTH', 'NONE')).toBe(true);
    expect(isParticipationTypeAllowed('BOTH', 'RPA_ONLY')).toBe(true);
    expect(isParticipationTypeAllowed('BOTH', 'TEPA_ONLY')).toBe(true);
    expect(isParticipationTypeAllowed('BOTH', 'BOTH')).toBe(true);
  });
});
