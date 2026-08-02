import { CHAT_ALLOWED_ROLES, TENANT_CHAT_ALLOWED_ROLES } from './allowedRoles';

describe('CHAT_ALLOWED_ROLES', () => {
  it('includes property_manager (both cases) so PMs can send/list messages on threads they already participate in', () => {
    expect(CHAT_ALLOWED_ROLES).toContain('property_manager');
    expect(CHAT_ALLOWED_ROLES).toContain('PROPERTY_MANAGER');
  });

  it('still includes tenant, landlord, and community_stakeholder (both cases)', () => {
    for (const role of ['tenant', 'TENANT', 'landlord', 'LANDLORD', 'community_stakeholder', 'COMMUNITY_STAKEHOLDER']) {
      expect(CHAT_ALLOWED_ROLES).toContain(role);
    }
  });
});

describe('TENANT_CHAT_ALLOWED_ROLES', () => {
  it('is restricted to tenant only (both cases)', () => {
    expect(TENANT_CHAT_ALLOWED_ROLES).toEqual(['tenant', 'TENANT']);
  });
});
