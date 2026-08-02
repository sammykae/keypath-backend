import { Router } from 'express';
import passport from 'passport';
import { validateRequest } from '../../../middleware/validate.middleware';
import { registerSchema } from '../validators/auth.validators';
import { errorResponse } from '../../../core/utils/response';
import { authMiddleware, optionalAuthMiddleware } from '../../../middleware/authMiddleware';
import { requireRole } from '../../../middleware/rbac.middleware';
import { uploadAvatarFile } from '../../docs/middleware/upload.middleware';
import {
  register,
  login,
  refresh,
  me,
  logout,
  oauthSuccess,
  suspendUser,
  reactivateUser,
  createAdmin,
} from '../controllers/auth.controller';
import { getProfile, updateProfile, uploadAvatar } from '../controllers/profile.controller';
import { verifyEmailHandler, resendVerificationEmailHandler } from '../controllers/email-verification.controller';
import { profileSetupHandler } from '../controllers/profile-setup.controller';
import { forgotPasswordHandler, resetPasswordHandler } from '../controllers/forgot-password.controller';

const router = Router();

// Codex: detailed Auth docs for Swagger consumers and cross-team integration.
/* -------------------------------------------------------------------------- */
/*                               LOCAL AUTH                                   */
/* -------------------------------------------------------------------------- */

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user (email + password)
 *     description: |
 *       Creates an account for any supported role. ADMIN is internal-only and not allowed here.
 *       - **COMMUNITY_STAKEHOLDER** and **INVESTOR** are self-serve — no onboardingToken required.
 *       - **TENANT** and **LANDLORD** require an onboardingToken (invite link from admin/landlord).
 *       Response includes `dashboardRoute` for immediate redirect and `nextStep: "verify_email"`.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, role]
 *             properties:
 *               email:    { type: string, format: email, example: "sarah@kumasi.gov.gh" }
 *               password: { type: string, minLength: 8, example: "SecurePass1!" }
 *               role:
 *                 type: string
 *                 enum: [TENANT, LANDLORD, COMMUNITY, COMMUNITY_STAKEHOLDER, INVESTOR]
 *                 example: COMMUNITY_STAKEHOLDER
 *               firstName: { type: string, example: "Sarah" }
 *               lastName:  { type: string, example: "Osei" }
 *               phone:     { type: string, example: "+233501234567" }
 *               onboardingToken: { type: string, description: "Required for TENANT and LANDLORD only" }
 *     responses:
 *       201:
 *         description: Registered — returns JWT, user object, dashboardRoute, and nextStep
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 token: "eyJ..."
 *                 user: { id: "abc123", email: "sarah@kumasi.gov.gh", role: "COMMUNITY_STAKEHOLDER", status: "ACTIVE", emailVerified: false }
 *                 dashboardRoute: "/community"
 *                 nextStep: "verify_email"
 *       400:
 *         description: Validation error (missing fields, weak password, invalid role)
 *       409:
 *         description: Email already registered
 */
router.post('/register', validateRequest(registerSchema), register);

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Login with email and password
 *     description: Authenticate a user using email and password and return a JWT.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AuthLoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthSessionResponse'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.post('/login', login);

/**
 * @openapi
 * /api/auth/refresh:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Exchange a refresh token for a new access token
 *     description: Returns a new access token and a rotated refresh token. Fails with 401 if the refresh token is invalid, expired, or the user is suspended.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: New token pair issued
 *       400:
 *         description: refreshToken missing
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post('/refresh', refresh);

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     tags:
 *       - Auth
 *     summary: Get current authenticated user
 *     description: Returns the authenticated user's profile.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Authenticated user info
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthMeResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get(
  '/me',
  passport.authenticate('jwt', { session: false }),
  me
);

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Logout user
 *     description: Logout the current user (JWT is invalidated client-side).
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 */
router.post(
  '/logout',
  passport.authenticate('jwt', { session: false }),
  logout
);

/* -------------------------------------------------------------------------- */
/*                               OAUTH FLOWS                                  */
/* -------------------------------------------------------------------------- */

/**
 * @openapi
 * /api/auth/oauth/google:
 *   get:
 *     tags:
 *       - Auth
 *     summary: Login with Google
 *     description: Redirects user to Google OAuth login.
 *     responses:
 *       302:
 *         description: Redirect to Google
 */
router.get(
  '/oauth/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
  })
);

/**
 * @openapi
 * /api/auth/oauth/google/callback:
 *   get:
 *     tags:
 *       - Auth
 *     summary: Google OAuth callback
 *     description: Handles Google OAuth callback and returns a JWT.
 *     responses:
 *       200:
 *         description: OAuth login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthSessionResponse'
 *       401:
 *         description: OAuth failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get(
  '/oauth/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: '/api/auth/oauth/failure',
  }),
  oauthSuccess
);

/**
 * @openapi
 * /api/auth/oauth/linkedin:
 *   get:
 *     tags:
 *       - Auth
 *     summary: Login with LinkedIn
 *     description: Redirects user to LinkedIn OAuth login.
 *     responses:
 *       302:
 *         description: Redirect to LinkedIn
 */
router.get(
  '/oauth/linkedin',
  passport.authenticate('linkedin', {
    session: false,
  })
);

/**
 * @openapi
 * /api/auth/oauth/linkedin/callback:
 *   get:
 *     tags:
 *       - Auth
 *     summary: LinkedIn OAuth callback
 *     description: Handles LinkedIn OAuth callback and returns a JWT.
 *     responses:
 *       200:
 *         description: OAuth login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthSessionResponse'
 *       401:
 *         description: OAuth failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get(
  '/oauth/linkedin/callback',
  passport.authenticate('linkedin', {
    session: false,
    failureRedirect: '/api/auth/oauth/failure',
  }),
  oauthSuccess
);

/**
 * @openapi
 * /api/auth/oauth/facebook:
 *   get:
 *     tags:
 *       - Auth
 *     summary: Login with Facebook
 *     description: Redirects user to Facebook OAuth login.
 *     responses:
 *       302:
 *         description: Redirect to Facebook
 */
router.get(
  '/oauth/facebook',
  passport.authenticate('facebook', { 
    scope: ['email'],
    session: false,
  })
);

/**
 * @openapi
 * /api/auth/oauth/facebook/callback:
 *   get:
 *     tags:
 *       - Auth
 *     summary: Facebook OAuth callback
 *     description: Handles Facebook OAuth callback and returns a JWT.
 *     responses:
 *       200:
 *         description: OAuth login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthSessionResponse'
 *       401:
 *         description: OAuth failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get(
  '/oauth/facebook/callback',
  passport.authenticate('facebook', {
    session: false,
    failureRedirect: '/api/auth/oauth/failure',
  }),
  oauthSuccess
);

/* -------------------------------------------------------------------------- */
/*                               FAILURE                                      */
/* -------------------------------------------------------------------------- */

/**
 * @openapi
 * /api/auth/oauth/failure:
 *   get:
 *     tags:
 *       - Auth
 *     summary: OAuth failure handler
 *     description: Called when OAuth authentication fails.
 *     responses:
 *       401:
 *         description: OAuth authentication failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get('/oauth/failure', (_req, res) => {
  // Codex: keep OAuth failure response inside the project-wide response envelope.
  return errorResponse(res, 401, 'OAUTH_FAILED', 'OAuth authentication failed');
});

/* -------------------------------------------------------------------------- */
/*                          PROFILE                                           */
/* -------------------------------------------------------------------------- */

/**
 * @openapi
 * /api/auth/me/profile:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user profile (all role sub-documents)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile with role-specific sub-document
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:          { type: string }
 *                 email:       { type: string }
 *                 role:        { type: string }
 *                 status:      { type: string }
 *                 emailVerified: { type: boolean }
 *                 profile:     { type: object, properties: { firstName: { type: string }, lastName: { type: string }, avatarUrl: { type: string } } }
 *                 tenantProfile:    { type: object, nullable: true }
 *                 landlordProfile:  { type: object, nullable: true }
 *                 communityProfile: { type: object, nullable: true }
 *                 investorProfile:  { type: object, nullable: true }
 *   patch:
 *     tags: [Auth]
 *     summary: Update shared display name (firstName / lastName)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName: { type: string }
 *               lastName:  { type: string }
 *     responses:
 *       200:
 *         description: Updated profile
 */
router.get('/me/profile', authMiddleware, getProfile);
router.patch('/me/profile', authMiddleware, updateProfile);
router.post('/me/avatar', authMiddleware, uploadAvatarFile, uploadAvatar);

/**
 * @openapi
 * /api/auth/me/setup:
 *   post:
 *     tags: [Auth]
 *     summary: First-login role-specific profile setup
 *     description: |
 *       Call once after registration to fill the role-specific profile sub-document.
 *       Fields differ per role:
 *       - **TENANT** – firstName, lastName, phone, dateOfBirth, currentAddress, emergencyContactName, emergencyContactPhone
 *       - **LANDLORD** – firstName, lastName, phone, companyName, businessRegistrationNumber, address, country
 *       - **COMMUNITY_STAKEHOLDER** – firstName, lastName, orgName, orgType (municipality|school|nonprofit|other), contactTitle, phone, address, website, country
 *       - **INVESTOR** – firstName, lastName, phone, nationality, investmentRange (10k-50k|50k-250k|250k-1m|1m+), accreditedInvestor
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:    { type: string, example: "Sarah" }
 *               lastName:     { type: string, example: "Osei" }
 *               phone:        { type: string, example: "+233501234567" }
 *               orgName:      { type: string, example: "City of Kumasi" }
 *               orgType:      { type: string, enum: [municipality, school, nonprofit, other] }
 *               website:      { type: string, example: "https://kumasi.gov.gh" }
 *               country:      { type: string, example: "Ghana" }
 *               companyName:  { type: string }
 *               investmentRange: { type: string, enum: ["10k-50k", "50k-250k", "250k-1m", "1m+"] }
 *               accreditedInvestor: { type: boolean }
 *     responses:
 *       200:
 *         description: Role-specific profile updated
 *       400:
 *         description: Validation error
 */
router.post('/me/setup', authMiddleware, profileSetupHandler);

/**
 * @openapi
 * /api/auth/verify-email:
 *   get:
 *     tags: [Auth]
 *     summary: Verify email address via token link
 *     description: Token is sent automatically after registration. Link format — /verify-email?token=XXX
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema: { type: string }
 *         description: Email verification token from the email
 *     responses:
 *       200:
 *         description: Email verified
 *       400:
 *         description: Invalid or expired token
 *
 * /api/auth/verify-email/resend:
 *   post:
 *     tags: [Auth]
 *     summary: Re-send verification email
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Verification email sent
 *       409:
 *         description: Email already verified
 */
router.get('/verify-email', verifyEmailHandler);
router.post('/verify-email/resend', authMiddleware, resendVerificationEmailHandler);

router.post('/forgot-password', forgotPasswordHandler);
router.post('/reset-password', resetPasswordHandler);

/* -------------------------------------------------------------------------- */
/*                          ADMIN — CREATE ACCOUNT                            */
/* -------------------------------------------------------------------------- */

/**
 * @openapi
 * /api/auth/admin/create:
 *   post:
 *     tags: [Auth]
 *     summary: Create an admin account
 *     description: |
 *       Creates a new admin user. Protected by the `x-admin-secret` header which must match
 *       the `ADMIN_CREATION_SECRET` environment variable configured on the server.
 *
 *       **Bootstrap mode** (no admins exist yet): only the `x-admin-secret` header is needed.
 *       No JWT required.
 *
 *       **Subsequent admins**: requires a valid admin JWT (`Authorization: Bearer <token>`)
 *       **and** the `x-admin-secret` header.
 *
 *       The new admin account is created with `emailVerified: true` — no email
 *       verification step needed.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-admin-secret
 *         required: true
 *         schema: { type: string }
 *         description: Must match ADMIN_CREATION_SECRET env var on the server
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:     { type: string, format: email, example: "admin@keypath.ai" }
 *               password:  { type: string, minLength: 8, example: "KeyPath@Admin2025!" }
 *               firstName: { type: string, example: "Enger" }
 *               lastName:  { type: string, example: "Blessing" }
 *     responses:
 *       201:
 *         description: Admin created — returns JWT and user object
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 token: "eyJ..."
 *                 user: { id: "abc123", email: "admin@keypath.ai", role: "ADMIN", status: "ACTIVE", emailVerified: true }
 *                 dashboardRoute: "/admin"
 *       400:
 *         description: Missing or weak fields
 *       403:
 *         description: Invalid secret, or existing admins present but no admin JWT provided
 *       409:
 *         description: Email already registered
 *       503:
 *         description: ADMIN_CREATION_SECRET not configured on server
 */
router.post('/admin/create', optionalAuthMiddleware, createAdmin);

/* -------------------------------------------------------------------------- */
/*                          ADMIN — SUSPEND / REACTIVATE                      */
/* -------------------------------------------------------------------------- */

/**
 * @openapi
 * /api/auth/admin/users/{userId}/suspend:
 *   patch:
 *     tags:
 *       - Auth
 *     summary: Suspend a user (ADMIN only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User suspended
 *       400:
 *         description: Invalid userId
 *       404:
 *         description: User not found
 *       409:
 *         description: Already suspended
 */
router.patch(
  '/admin/users/:userId/suspend',
  passport.authenticate('jwt', { session: false }),
  requireRole(['admin']),
  suspendUser
);

/**
 * @openapi
 * /api/auth/admin/users/{userId}/reactivate:
 *   patch:
 *     tags:
 *       - Auth
 *     summary: Reactivate a suspended user (ADMIN only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User reactivated
 *       400:
 *         description: Invalid userId
 *       404:
 *         description: User not found
 *       409:
 *         description: Already active
 */
router.patch(
  '/admin/users/:userId/reactivate',
  passport.authenticate('jwt', { session: false }),
  requireRole(['admin']),
  reactivateUser
);

export default router;
