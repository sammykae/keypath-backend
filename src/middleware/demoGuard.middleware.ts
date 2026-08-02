import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { isDemoModeEnabled } from '../core/utils/demo.utils';
import { errorResponse } from '../core/utils/response';

/**
 * Routes that MUST work even in DEMO_MODE
 */
const DEMO_ALLOWED_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/oauth',
  '/api/auth/logout',
  '/api/request-demo',
  '/api/onboarding/community/interest',
  '/api/onboarding/community/create-account',
  '/api/onboarding/community/organization-information',
  '/api/onboarding/community/stakeholder-type',
  '/api/onboarding/community/program-association',
  '/api/onboarding/community/data-visibility-privacy',
  '/api/onboarding/community/impact-goals',
  '/api/onboarding/community/review-activate',
  '/api/onboarding/investor/interest',
  '/api/onboarding/investor/create-account',
  '/api/onboarding/investor/status-acknowledgment',
  '/api/onboarding/investor/investment-preferences',
  '/api/onboarding/investor/legal-acknowledgments',
  '/api/onboarding/investor/all-set',
  '/api/onboarding/landlord/interest',
  '/api/onboarding/landlord/create-account',
  '/api/onboarding/landlord/tenant/interests',
  '/api/onboarding/tenant/interest',
  '/api/onboarding/tenant/create-account',
  '/api/onboarding/tenant/identity-verification',
  '/api/onboarding/tenant/lease-association',
  '/api/onboarding/tenant/program-explanation',
  '/api/onboarding/tenant/participation-status',
  '/api/onboarding/tenant/dashboard-walkthrough',
];

const DESTRUCTIVE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const DEMO_ADMIN_ROLES = new Set(['ADMIN', 'admin']);

/** Landlord write APIs allowed in DEMO_MODE for local/Swagger QA (non-admin tokens). */
const DEMO_ALLOWLIST_WRITE_PREFIXES = ['/api/landlord/tenant-participation'];

// Codex: demoGuard runs before most route auth, so we also inspect bearer JWT for admin override.
const getRoleFromBearerToken = (authHeader?: string): string | null => {
  if (!authHeader?.startsWith('Bearer ')) return null;

  const secret = process.env.JWT_SECRET;
  if (!secret) return null;

  try {
    const decoded = jwt.verify(authHeader.slice(7), secret) as {
      role?: unknown;
    };
    return typeof decoded.role === 'string' ? decoded.role : null;
  } catch {
    return null;
  }
};

export const demoGuard = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Codex: use shared parser instead of relying on raw env schema transform behavior.
  if (!isDemoModeEnabled()) return next();

  // Always allow auth flows
  if (DEMO_ALLOWED_PATHS.some((p) => req.path.startsWith(p))) {
    return next();
  }

  // Allow safe reads
  if (!DESTRUCTIVE_METHODS.includes(req.method)) {
    return next();
  }

  if (DEMO_ALLOWLIST_WRITE_PREFIXES.some((p) => req.path.startsWith(p))) {
    return next();
  }

  const user = req.user as any;

  // Admin override
  if (DEMO_ADMIN_ROLES.has(user?.role)) {
    return next();
  }

  // Codex: fallback admin check for requests authenticated only by downstream middleware.
  const tokenRole = getRoleFromBearerToken(req.headers.authorization);
  if (tokenRole && DEMO_ADMIN_ROLES.has(tokenRole)) {
    return next();
  }

  return errorResponse(
    res,
    403,
    'DEMO_MODE_BLOCKED',
    'Action disabled in demo mode'
  );
};
