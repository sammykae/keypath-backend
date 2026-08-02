import mongoose from 'mongoose';
import { searchAccessGuard, logOwnershipGuard } from '../search-access.guard';
import { AuthUser } from '../../../auth/types/auth-user';

// ── helpers ────────────────────────────────────────────────────────────────

const uid = new mongoose.Types.ObjectId();

function makeAuth(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    _id: uid,
    email: 'test@example.com',
    role: 'tenant',
    orgId: null,
    ...overrides,
  };
}

// ── searchAccessGuard ──────────────────────────────────────────────────────

describe('searchAccessGuard', () => {
  describe('landlord', () => {
    it('allows when orgId is present in JWT', () => {
      const result = searchAccessGuard(makeAuth({ role: 'landlord', orgId: 'org_abc' }));
      expect(result.allowed).toBe(true);
      if (result.allowed) {
        expect(result.ctx.orgId).toBe('org_abc');
        expect(result.ctx.userId).toBe(String(uid));
        expect(result.ctx.role).toBe('landlord');
      }
    });

    it('blocks when orgId is missing — onboarding incomplete', () => {
      const result = searchAccessGuard(makeAuth({ role: 'landlord', orgId: null }));
      expect(result.allowed).toBe(false);
      if (!result.allowed) expect(result.code).toBe('MISSING_ORG');
    });

    it('blocks with correct HTTP status 403', () => {
      const result = searchAccessGuard(makeAuth({ role: 'landlord', orgId: null }));
      expect(result.allowed).toBe(false);
      if (!result.allowed) expect(result.status).toBe(403);
    });
  });

  describe('tenant', () => {
    it('allows without orgId — scope derived at query time', () => {
      const result = searchAccessGuard(makeAuth({ role: 'tenant', orgId: null }));
      expect(result.allowed).toBe(true);
    });

    it('ignores any orgId on the JWT — tenant scope is never org-based', () => {
      const result = searchAccessGuard(makeAuth({ role: 'tenant', orgId: 'some_org' }));
      expect(result.allowed).toBe(true);
      // ctx.orgId must be null — tenant cannot use orgId to broaden scope
      if (result.allowed) expect(result.ctx.orgId).toBeNull();
    });
  });

  describe('investor', () => {
    it('allows — membership lookup happens at query time, not here', () => {
      const result = searchAccessGuard(makeAuth({ role: 'investor' }));
      expect(result.allowed).toBe(true);
      if (result.allowed) expect(result.ctx.orgId).toBeNull();
    });

    it('cannot use a landlord orgId to access landlord data', () => {
      // Even if an investor JWT somehow contains an orgId, it must not be forwarded
      const result = searchAccessGuard(makeAuth({ role: 'investor', orgId: 'landlord_org' }));
      expect(result.allowed).toBe(true);
      if (result.allowed) expect(result.ctx.orgId).toBeNull();
    });
  });

  describe('community_stakeholder', () => {
    it('allows — scope derived from memberships at query time', () => {
      const result = searchAccessGuard(makeAuth({ role: 'community_stakeholder' }));
      expect(result.allowed).toBe(true);
      if (result.allowed) expect(result.ctx.orgId).toBeNull();
    });
  });

  describe('admin', () => {
    it('allows with or without orgId', () => {
      expect(searchAccessGuard(makeAuth({ role: 'admin', orgId: 'org1' })).allowed).toBe(true);
      expect(searchAccessGuard(makeAuth({ role: 'admin', orgId: null })).allowed).toBe(true);
    });
  });

  describe('unknown role', () => {
    it('blocks an unrecognised role', () => {
      const result = searchAccessGuard(makeAuth({ role: 'superuser' as any }));
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.code).toBe('ROLE_NOT_PERMITTED');
        expect(result.status).toBe(403);
      }
    });

    it('blocks empty string role', () => {
      const result = searchAccessGuard(makeAuth({ role: '' as any }));
      expect(result.allowed).toBe(false);
    });
  });

  describe('cross-role leakage', () => {
    it('tenant ctx.orgId is always null regardless of JWT orgId', () => {
      const result = searchAccessGuard(makeAuth({ role: 'tenant', orgId: 'evil_org' }));
      if (result.allowed) expect(result.ctx.orgId).toBeNull();
    });

    it('investor ctx.orgId is always null regardless of JWT orgId', () => {
      const result = searchAccessGuard(makeAuth({ role: 'investor', orgId: 'landlord_org' }));
      if (result.allowed) expect(result.ctx.orgId).toBeNull();
    });

    it('landlord ctx.orgId matches JWT orgId exactly — cannot be overridden', () => {
      const result = searchAccessGuard(makeAuth({ role: 'landlord', orgId: 'my_org' }));
      if (result.allowed) expect(result.ctx.orgId).toBe('my_org');
    });
  });
});

// ── logOwnershipGuard ──────────────────────────────────────────────────────

describe('logOwnershipGuard', () => {
  const validId = new mongoose.Types.ObjectId().toHexString();

  it('rejects invalid ObjectId format', async () => {
    const result = await logOwnershipGuard('not-an-objectid', 'user1');
    expect(result).toBe(false);
  });

  it('rejects empty logId', async () => {
    const result = await logOwnershipGuard('', 'user1');
    expect(result).toBe(false);
  });
});
