import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { User } from '../models/user.model';
import { Membership } from '../../orgs/models/membership.model';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { generateJwt, generateRefreshJwt } from '../../../core/config/passport';
import { AppError } from '../../../core/errors/AppError';
import { writeAuditEvent } from '../../audit/services/audit.service';
import { env } from '../../../core/config/env';
import {
  assertCommunityRegistrationEligibility,
  consumeCommunityInviteToken,
} from '../../onboarding/services/community-interest.service';
import {
  assertInvestorRegistrationEligibility,
  consumeInvestorInviteToken,
} from '../../onboarding/services/investor-interest.service';
import {
  assertLandlordRegistrationEligibility,
  consumeLandlordInviteToken,
} from '../../onboarding/services/landlord-interest.service';
import {
  assertTenantRegistrationEligibility,
  consumeTenantInviteToken,
} from '../../onboarding/services/tenant-interest.service';
import { acceptPendingInvitesForEmail } from '../../invites/services/tenantInvite.service';
import { sendVerificationEmail } from '../services/email-verification.service';

function dashboardRouteForRole(role: string): string {
  const r = role.toUpperCase();
  if (r === 'TENANT') return '/tenant';
  if (r === 'LANDLORD') return '/landlord';
  if (r === 'COMMUNITY' || r === 'COMMUNITY_STAKEHOLDER') return '/community';
  if (r === 'INVESTOR') return '/investors';
  if (r === 'ADMIN') return '/admin';
  return '/';
}

/* -------------------------------------------------------------------------- */
/*                                   REGISTER                                 */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/auth/register
 */
export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, role, firstName, lastName, phone, onboardingToken } = req.body;
    const normalizedEmail = String(email).toLowerCase().trim();
    let landlordInvite:
      | Awaited<ReturnType<typeof assertLandlordRegistrationEligibility>>
      | null = null;
    let tenantInvite:
      | Awaited<ReturnType<typeof assertTenantRegistrationEligibility>>
      | null = null;
    let communityInvite:
      | Awaited<ReturnType<typeof assertCommunityRegistrationEligibility>>
      | null = null;
    let investorInvite:
      | Awaited<ReturnType<typeof assertInvestorRegistrationEligibility>>
      | null = null;

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return errorResponse(res, 409, 'EMAIL_EXISTS', 'Email already registered');
    }

    if (role === 'LANDLORD') {
      if (!onboardingToken) {
        return errorResponse(
          res,
          403,
          'LANDLORD_ONBOARDING_LINK_REQUIRED',
          'Landlord registration requires an admin-generated onboarding link'
        );
      }

      landlordInvite = await assertLandlordRegistrationEligibility(
        onboardingToken,
        normalizedEmail
      );
    }

    if (role === 'TENANT') {
      if (!onboardingToken) {
        return errorResponse(
          res,
          403,
          'TENANT_ONBOARDING_LINK_REQUIRED',
          'Tenant registration requires an admin-generated onboarding link'
        );
      }

      tenantInvite = await assertTenantRegistrationEligibility(
        onboardingToken,
        normalizedEmail
      );
    }

    // Community and investor are self-serve — token is optional (used only for invite prefill)
    if ((role === 'COMMUNITY' || role === 'COMMUNITY_STAKEHOLDER') && onboardingToken) {
      communityInvite = await assertCommunityRegistrationEligibility(
        onboardingToken,
        normalizedEmail,
        role
      );
    }

    // Investor is self-serve — token is optional (used only for invite prefill)
    if (role === 'INVESTOR' && onboardingToken) {
      investorInvite = await assertInvestorRegistrationEligibility(
        onboardingToken,
        normalizedEmail,
        role
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      email: normalizedEmail,
      phone,
      passwordHash,
      role,
      status: 'ACTIVE',
      oauthProviders: [],
      profile: {
        firstName:
          firstName ||
          landlordInvite?.prefill.firstName ||
          tenantInvite?.prefill.firstName ||
          communityInvite?.prefill.firstName ||
          investorInvite?.prefill.firstName,
        lastName:
          lastName ||
          landlordInvite?.prefill.lastName ||
          tenantInvite?.prefill.lastName ||
          communityInvite?.prefill.lastName ||
          investorInvite?.prefill.lastName,
      },
    });

    if (role === 'TENANT') {
      await acceptPendingInvitesForEmail(normalizedEmail);
    }

    try {
      if (role === 'LANDLORD' && onboardingToken) {
        await consumeLandlordInviteToken(
          onboardingToken,
          user._id as Types.ObjectId
        );
      }
      if (role === 'TENANT' && onboardingToken) {
        await consumeTenantInviteToken(
          onboardingToken,
          user._id as Types.ObjectId
        );
      }
      if (
        (role === 'COMMUNITY' || role === 'COMMUNITY_STAKEHOLDER') &&
        onboardingToken
      ) {
        await consumeCommunityInviteToken(
          onboardingToken,
          user._id as Types.ObjectId
        );
      }
      if (role === 'INVESTOR' && onboardingToken) {
        await consumeInvestorInviteToken(
          onboardingToken,
          user._id as Types.ObjectId
        );
      }
    } catch (consumeErr) {
      await User.deleteOne({ _id: user._id }).catch(() => undefined);
      throw consumeErr;
    }

    const token = generateJwt(user);
    const refreshToken = generateRefreshJwt(user);

    await writeAuditEvent({
      actorUserId: user._id as Types.ObjectId,
      action: 'USER_REGISTERED',
      entityType: 'User',
      entityId: user._id as Types.ObjectId,
      diff: { before: null, after: { email: user.email, role: user.role } },
    });

    // Send email verification — fire-and-forget, never block registration
    sendVerificationEmail(user._id as Types.ObjectId, user.email).catch(() => undefined);

    return successResponse(
      res,
      {
        token,
        refreshToken,
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          status: user.status,
          emailVerified: false,
        },
        dashboardRoute: dashboardRouteForRole(user.role),
        nextStep: 'verify_email',
      },
      201
    );
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(res, err.statusCode, 'REGISTER_FAILED', err.message);
    }

    return errorResponse(res, 500, 'REGISTER_FAILED', 'Failed to register user');
  }
};

/* -------------------------------------------------------------------------- */
/*                                    LOGIN                                   */
/* -------------------------------------------------------------------------- */

export const login = (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate(
    'local',
    { session: false },
    async (err: any, user: any, info: any) => {
      if (err) return next(err);

      if (!user) {
        return errorResponse(
          res,
          401,
          'INVALID_CREDENTIALS',
          info?.message || 'Invalid email or password'
        );
      }

      if ((user.role || '').toUpperCase() === 'TENANT' && user.email) {
        await acceptPendingInvitesForEmail(user.email);
      }

      let orgId: string | null = null;
      const role = (user.role || '').toUpperCase();
      if (role === 'LANDLORD' || role === 'ADMIN') {
        const m = await Membership.findOne({
          userId: user._id,
          status: 'active',
          roleInOrg: { $in: ['OWNER', 'ADMIN'] },
        })
          .select('orgId')
          .lean();
        orgId = m?.orgId?.toString() ?? null;
      }

      const token = generateJwt(user, orgId);
      const refreshToken = generateRefreshJwt(user);

      await writeAuditEvent({
        actorUserId: user._id as Types.ObjectId,
        action: 'USER_LOGGED_IN',
        entityType: 'User',
        entityId: user._id as Types.ObjectId,
      });

      return successResponse(res, {
        token,
        refreshToken,
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          status: user.status,
          emailVerified: user.emailVerified ?? false,
        },
        dashboardRoute: dashboardRouteForRole(user.role),
      });
    }
  )(req, res, next);
};

/* -------------------------------------------------------------------------- */
/*                                   REFRESH                                  */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/auth/refresh
 * Exchanges a valid refresh token for a new access token (+ rotated refresh token).
 */
export const refresh = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body ?? {};
    if (!refreshToken || typeof refreshToken !== 'string') {
      return errorResponse(res, 400, 'VALIDATION_ERROR', 'refreshToken is required');
    }

    let decoded: { sub?: string; type?: string };
    try {
      decoded = jwt.verify(refreshToken, env.JWT_SECRET) as { sub?: string; type?: string };
    } catch {
      return errorResponse(res, 401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token');
    }

    if (decoded.type !== 'refresh' || !decoded.sub) {
      return errorResponse(res, 401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token');
    }

    const user = await User.findById(decoded.sub);
    if (!user || user.status === 'SUSPENDED') {
      return errorResponse(res, 401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token');
    }

    let orgId: string | null = null;
    const role = (user.role || '').toUpperCase();
    if (role === 'LANDLORD' || role === 'ADMIN') {
      const m = await Membership.findOne({
        userId: user._id,
        status: 'active',
        roleInOrg: { $in: ['OWNER', 'ADMIN'] },
      })
        .select('orgId')
        .lean();
      orgId = m?.orgId?.toString() ?? null;
    }

    const token = generateJwt(user, orgId);
    const newRefreshToken = generateRefreshJwt(user);

    return successResponse(res, {
      token,
      refreshToken: newRefreshToken,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    });
  } catch {
    return errorResponse(res, 500, 'REFRESH_FAILED', 'Failed to refresh token');
  }
};

/* -------------------------------------------------------------------------- */
/*                                     ME                                     */
/* -------------------------------------------------------------------------- */

export const me = async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
  }

  const user = req.user as any;
  // Codex: include org context so onboarding and role-scoped UIs do not need extra bootstrap calls.
  const memberships = await Membership.find({
    userId: user._id,
    status: 'active',
  })
    .select('orgId roleInOrg status')
    .lean();

  return successResponse(res, {
    id: user._id,
    email: user.email,
    role: user.role,
    status: user.status,
    orgContext: {
      primaryOrgId: memberships[0]?.orgId ?? null,
      memberships: memberships.map((membership) => ({
        orgId: membership.orgId,
        roleInOrg: membership.roleInOrg,
        status: membership.status,
      })),
    },
  });
};

/* -------------------------------------------------------------------------- */
/*                                   LOGOUT                                   */
/* -------------------------------------------------------------------------- */

export const logout = async (req: Request, res: Response) => {
  const user = req.user as any;
  if (user?._id) {
    await writeAuditEvent({
      actorUserId: user._id as Types.ObjectId,
      action: 'USER_LOGGED_OUT',
      entityType: 'User',
      entityId: user._id as Types.ObjectId,
    });
  }
  return successResponse(res, { message: 'Logged out successfully' });
};

/* -------------------------------------------------------------------------- */
/*                                OAUTH SUCCESS                               */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*                          ADMIN — SUSPEND / REACTIVATE                      */
/* -------------------------------------------------------------------------- */

export const suspendUser = async (req: Request, res: Response) => {
  const actor = req.user as any;
  const { userId } = req.params;

  if (!Types.ObjectId.isValid(userId)) {
    return errorResponse(res, 400, 'INVALID_USER_ID', 'userId must be a valid ObjectId');
  }

  const target = await User.findById(userId);
  if (!target) {
    return errorResponse(res, 404, 'USER_NOT_FOUND', 'User not found');
  }
  if (target.status === 'SUSPENDED') {
    return errorResponse(res, 409, 'ALREADY_SUSPENDED', 'User is already suspended');
  }

  const prevStatus = target.status;
  target.status = 'SUSPENDED';
  await target.save();

  await writeAuditEvent({
    actorUserId: actor._id as Types.ObjectId,
    action: 'USER_SUSPENDED',
    entityType: 'User',
    entityId: target._id as Types.ObjectId,
    diff: { before: { status: prevStatus }, after: { status: 'SUSPENDED' } },
  });

  return successResponse(res, {
    id: target._id,
    email: target.email,
    status: target.status,
  });
};

export const reactivateUser = async (req: Request, res: Response) => {
  const actor = req.user as any;
  const { userId } = req.params;

  if (!Types.ObjectId.isValid(userId)) {
    return errorResponse(res, 400, 'INVALID_USER_ID', 'userId must be a valid ObjectId');
  }

  const target = await User.findById(userId);
  if (!target) {
    return errorResponse(res, 404, 'USER_NOT_FOUND', 'User not found');
  }
  if (target.status === 'ACTIVE') {
    return errorResponse(res, 409, 'ALREADY_ACTIVE', 'User is already active');
  }

  const prevStatus = target.status;
  target.status = 'ACTIVE';
  await target.save();

  await writeAuditEvent({
    actorUserId: actor._id as Types.ObjectId,
    action: 'USER_REACTIVATED',
    entityType: 'User',
    entityId: target._id as Types.ObjectId,
    diff: { before: { status: prevStatus }, after: { status: 'ACTIVE' } },
  });

  return successResponse(res, {
    id: target._id,
    email: target.email,
    status: target.status,
  });
};

/* -------------------------------------------------------------------------- */
/*                                OAUTH SUCCESS                               */
/* -------------------------------------------------------------------------- */

export const oauthSuccess = async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 401, 'UNAUTHORIZED', 'OAuth authentication failed');
  }

  const user = req.user as any;
  let orgId: string | null = null;
  const role = (user.role || '').toUpperCase();
  if (role === 'LANDLORD' || role === 'ADMIN') {
    const m = await Membership.findOne({
      userId: user._id,
      status: 'active',
      roleInOrg: { $in: ['OWNER', 'ADMIN'] },
    })
      .select('orgId')
      .lean();
    orgId = m?.orgId?.toString() ?? null;
  }
  const token = generateJwt(user, orgId);

  return successResponse(res, {
    token,
    user: {
      id: user._id,
      email: user.email,
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerified ?? false,
    },
    dashboardRoute: dashboardRouteForRole(user.role),
  });
};

/* -------------------------------------------------------------------------- */
/*                           CREATE ADMIN ACCOUNT                             */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/auth/admin/create
 *
 * Two modes:
 *   Bootstrap  — no admins exist yet. Only x-admin-secret header is required.
 *   Subsequent — admins already exist. Requires valid admin JWT + x-admin-secret.
 *
 * ADMIN_CREATION_SECRET must be set in env. If missing the endpoint returns 503.
 */
export const createAdmin = async (req: Request, res: Response) => {
  try {
    const secret = env.ADMIN_CREATION_SECRET;
    if (!secret) {
      return errorResponse(
        res,
        503,
        'ADMIN_CREATION_NOT_CONFIGURED',
        'ADMIN_CREATION_SECRET is not configured on this server'
      );
    }

    const providedSecret = req.headers['x-admin-secret'];
    if (!providedSecret || providedSecret !== secret) {
      return errorResponse(res, 403, 'INVALID_ADMIN_SECRET', 'Invalid or missing x-admin-secret header');
    }

    const adminCount = await User.countDocuments({ role: 'ADMIN' });

    // After the first admin exists, require an authenticated admin to create more
    if (adminCount > 0) {
      const actor = (req as any).auth;
      if (!actor || (actor.role as string).toUpperCase() !== 'ADMIN') {
        return errorResponse(
          res,
          403,
          'ADMIN_AUTH_REQUIRED',
          'An existing admin JWT is required to create additional admin accounts'
        );
      }
    }

    const { email, password, firstName, lastName } = req.body;

    if (!email || !password) {
      return errorResponse(res, 400, 'VALIDATION_ERROR', 'email and password are required');
    }
    if (typeof password !== 'string' || password.length < 8) {
      return errorResponse(res, 400, 'WEAK_PASSWORD', 'Password must be at least 8 characters');
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return errorResponse(res, 409, 'EMAIL_EXISTS', 'Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const admin = await User.create({
      email: normalizedEmail,
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
      oauthProviders: [],
      profile: {
        firstName: firstName ?? '',
        lastName: lastName ?? '',
      },
    });

    const actor = (req as any).auth;
    await writeAuditEvent({
      actorUserId: (actor?._id ?? admin._id) as Types.ObjectId,
      action: 'ADMIN_CREATED',
      entityType: 'User',
      entityId: admin._id as Types.ObjectId,
      diff: { before: null, after: { email: admin.email, role: 'ADMIN' } },
    });

    const token = generateJwt(admin);

    return successResponse(
      res,
      {
        token,
        user: {
          id: admin._id,
          email: admin.email,
          role: admin.role,
          status: admin.status,
          emailVerified: admin.emailVerified,
        },
        dashboardRoute: '/admin',
      },
      201
    );
  } catch (err) {
    return errorResponse(res, 500, 'CREATE_ADMIN_FAILED', 'Failed to create admin account');
  }
};
