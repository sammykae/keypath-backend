import mongoose from 'mongoose';
import { AuthUser } from '../../auth/types/auth-user';
import { SearchContext } from '../types/search.types';
import { SearchLogModel } from '../../search-log/models/search-log.model';

// All roles that are permitted to use the search endpoint
const SEARCH_CAPABLE_ROLES = new Set([
  'landlord',
  'tenant',
  'investor',
  'community_stakeholder',
  'admin',
]);

export type SearchGuardResult =
  | { allowed: true; ctx: SearchContext }
  | { allowed: false; status: number; code: string; message: string };

/**
 * Validates the caller's role and derives a scope-locked SearchContext.
 *
 * ALL scope values in the returned ctx are derived strictly from the verified JWT
 * (auth.orgId, auth._id) — no user-supplied query parameters are trusted.
 *
 * Role rules enforced:
 *   landlord  → must have orgId in JWT; search scoped to their org only
 *   tenant    → no extra prereq; search scoped to their active tenancy at query time
 *   investor  → no extra prereq; search scoped to their org memberships at query time
 *   community → no extra prereq; search scoped to their org memberships at query time
 *   admin     → same as landlord but no orgId requirement (can impersonate / cross-org)
 */
export function searchAccessGuard(auth: AuthUser): SearchGuardResult {
  const userId = String(auth._id);
  const { role, orgId } = auth;

  if (!SEARCH_CAPABLE_ROLES.has(role)) {
    return {
      allowed: false,
      status: 403,
      code: 'ROLE_NOT_PERMITTED',
      message: `Role '${role}' is not permitted to access search`,
    };
  }

  if (role === 'landlord') {
    if (!orgId) {
      return {
        allowed: false,
        status: 403,
        code: 'MISSING_ORG',
        message: 'Account has no organization — complete onboarding before searching',
      };
    }
    // orgId comes from JWT only — cannot be spoofed via query params
    return { allowed: true, ctx: { userId, orgId, role } };
  }

  if (role === 'admin') {
    // Admin may have an orgId (if they belong to one) but it is not required.
    // Their search scope is handled by the 'landlord' path in querySearchIndex when orgId present.
    return { allowed: true, ctx: { userId, orgId: orgId ?? null, role } };
  }

  // tenant, investor, community_stakeholder: scope is derived from DB at query time
  // using the caller's own userId — no JWT orgId needed or trusted here
  return { allowed: true, ctx: { userId, orgId: null, role } };
}

/**
 * Verifies that a SearchLog entry belongs to the requesting user.
 * Used on the click-tracking endpoint to prevent log tampering.
 */
export async function logOwnershipGuard(logId: string, userId: string): Promise<boolean> {
  if (!mongoose.Types.ObjectId.isValid(logId)) return false;
  const log = await SearchLogModel.findById(logId).select('userId').lean();
  if (!log) return false;
  return String(log.userId) === userId;
}
