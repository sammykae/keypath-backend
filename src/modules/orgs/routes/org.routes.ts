import { Router } from 'express';
import passport from 'passport';
import {
  createOrganization,
  listMyOrganizations,
  removeMember,
  getOrganizationById
} from '../controllers/org.controller';
import { addMember, listMembers, updateMember } from '../controllers/membership.controller';
import { requireOrgRole } from '../middleware/requireOrgRole';
const router = Router();

// Codex: expanded Org/Membership docs for BE-011 integration clarity.
/* -------------------------------------------------------------------------- */
/*                               ORGANIZATIONS                                 */
/* -------------------------------------------------------------------------- */

/**
 * @openapi
 * /api/orgs:
 *   post:
 *     tags:
 *       - Organizations
 *     summary: Create a new organization
 *     description: >
 *       Creates a new organization and assigns the authenticated user
 *       as the OWNER.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateOrganizationRequest'
 *     responses:
 *       201:
 *         description: Organization created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrganizationResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.post(
  '/orgs',
  passport.authenticate('jwt', { session: false }),
  createOrganization
);

/**
 * @openapi
 * /api/orgs:
 *   get:
 *     tags:
 *       - Organizations
 *     summary: List my organizations
 *     description: Returns organizations where the authenticated user has an active membership.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Organization memberships returned
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrganizationMembershipSummaryListResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get(
  '/orgs',
  passport.authenticate('jwt', { session: false }),
  // Codex: expose org context endpoint required by onboarding and /auth/me consumers.
  listMyOrganizations
);
/**
 * @openapi
 * /api/orgs/{orgId}:
 *   get:
 *     tags:
 *       - Organizations
 *     summary: Get organization details
 *     description: >
 *       Returns organization details.
 *       Accessible to active organization members only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Organization details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrganizationDetailsResponse'
 *       403:
 *         description: Not a member
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       404:
 *         description: Organization not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get(
  '/orgs/:orgId',
  passport.authenticate('jwt', { session: false }),
  getOrganizationById
);
/**
 * @openapi
 * /api/orgs/{orgId}/members:
 *   get:
 *     tags:
 *       - Organizations
 *     summary: List members of an organization
 *     description: >
 *       Returns all members of an organization.
 *       Requires OWNER or ADMIN role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of organization members
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MembershipListResponse'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get(
  '/orgs/:orgId/members',
  passport.authenticate('jwt', { session: false }),
  requireOrgRole(['OWNER', 'ADMIN']),
  listMembers
);
/**
 * @openapi
 * /api/orgs/{orgId}/members:
 *   post:
 *     tags:
 *       - Organizations
 *     summary: Add a member to organization
 *     description: Adds a user to an organization with an initial role and invited status.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AddOrganizationMemberRequest'
 *     responses:
 *       201:
 *         description: Member added successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MembershipResponse'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.post(
  '/orgs/:orgId/members',
  passport.authenticate('jwt', { session: false }),
  requireOrgRole(['OWNER', 'ADMIN']),
  // Codex: this route completes membership CRUD for BE-011.
  addMember
);
/**
 * @openapi
 * /api/orgs/{orgId}/members/{memberId}:
 *   patch:
 *     tags:
 *       - Organizations
 *     summary: Update organization member
 *     description: >
 *       Updates a member's role or status.
 *       Requires OWNER or ADMIN role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateOrganizationMemberRequest'
 *     responses:
 *       200:
 *         description: Member updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MembershipResponse'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.patch(
  '/orgs/:orgId/members/:memberId',
  passport.authenticate('jwt', { session: false }),
  requireOrgRole(['OWNER', 'ADMIN']),
  updateMember
);
/**
 * @openapi
 * /api/orgs/{orgId}/members/{userId}:
 *   delete:
 *     tags:
 *       - Organizations
 *     summary: Remove member from organization
 *     description: >
 *       Removes a user from an organization.
 *       Requires OWNER or ADMIN role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Member removed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.delete(
  '/orgs/:orgId/members/:userId',
  passport.authenticate('jwt', { session: false }),
  requireOrgRole(['OWNER', 'ADMIN']),
  removeMember
);
export default router;
