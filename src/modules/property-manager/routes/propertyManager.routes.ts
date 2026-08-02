import { Router } from 'express';
import { authMiddleware } from '../../../middleware/authMiddleware';
import { requireRole } from '../../../middleware/rbac.middleware';
import {
  assignPropertyManagerHandler,
  listPropertyManagerAssignmentsHandler,
  revokePropertyManagerHandler,
  updateAssignmentPermissionsHandler,
  getPMInviteStatusHandler,
  resendPMInviteHandler,
  revokePMInviteHandler,
  listMyAssignmentsHandler,
  listNotesForPMHandler,
  createNoteAsPMHandler,
  listTenantContactsHandler,
} from '../controllers/propertyManager.controller';
import {
  listLandlordContextsHandler,
  getDashboardSummaryHandler,
  listPropertiesHandler,
  listUnitsHandler,
  listTenantsHandler,
  listLeasesHandler,
  listMaintenanceHandler,
} from '../controllers/propertyManagerDashboard.controller';
import {
  createPMLandlordThreadHandler,
  createPMGroupThreadHandler,
} from '../controllers/propertyManagerChat.controller';
import {
  listRewardsHandler,
  createRewardHandler,
  listCampaignsHandler,
  createCampaignHandler,
  listChallengesHandler,
  createChallengeHandler,
  listPendingRedemptionsHandler,
  reviewRedemptionHandler,
  adjustBalanceHandler,
  listVerificationsHandler,
  markEligibleHandler as markEligibleForVerificationHandler,
  reviewVerificationHandler,
  resolveDisputeHandler as resolveVerificationDisputeHandler,
} from '../controllers/propertyManagerRPA.controller';
import {
  getTenantTEPASummaryHandler,
  getTenantTokenLedgerHandler,
  getPropertyTEPASummaryHandler,
  getPropertyValuationHandler,
  listAgreementsHandler as listAgreementsForPMHandler,
} from '../controllers/propertyManagerTEPA.controller';
import { listComplianceHandler as listComplianceForPMHandler } from '../controllers/propertyManagerCompliance.controller';
import {
  listLiquidityRequestsHandler,
} from '../controllers/propertyManagerTEPA.controller';
import { exportDatasetHandler } from '../controllers/propertyManagerReports.controller';
import {
  addTenantHandler,
  updateMaintenanceHandler,
} from '../controllers/propertyManagerOperations.controller';
import { uploadSingle } from '../../docs/middleware/upload.middleware';
import { maintenanceUploadHandler } from '../../maintenance/controllers/maintenanceUpload.controller';

const landlordRouter = Router();
const selfRouter = Router();
landlordRouter.use(authMiddleware);
landlordRouter.use(requireRole(['landlord', 'admin']));

/**
 * @swagger
 * /api/landlord/property-managers:
 *   get:
 *     summary: List active property manager assignments for the org
 *     tags: [Landlord, PropertyManager]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: propertyId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: assignments[]
 *   post:
 *     summary: Assign a property manager to a property
 *     description: >
 *       Creates the PM user if the email doesn't exist yet (PROPERTY_MANAGER role, thin —
 *       no dashboard yet). A PM assigned to Property A cannot access Property B unless a
 *       separate assignment exists for it. Audit-logged.
 *     tags: [Landlord, PropertyManager]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, propertyId]
 *             properties:
 *               email: { type: string }
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               propertyId: { type: string }
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [ADD_TENANT, INVITE_TENANT, UPLOAD_TENANT_INFO, UPLOAD_NOTES, SUBMIT_MAINTENANCE_UPDATES, MESSAGE_TENANT, UPLOAD_DOCUMENTS]
 *     responses:
 *       201:
 *         description: Created/reactivated assignment
 *       409:
 *         description: Email belongs to a user with a different role
 */
landlordRouter.get('/', listPropertyManagerAssignmentsHandler);
landlordRouter.post('/', assignPropertyManagerHandler);

/**
 * @swagger
 * /api/landlord/property-managers/{assignmentId}:
 *   delete:
 *     summary: Revoke a property manager's access to a property
 *     tags: [Landlord, PropertyManager]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: revoked
 */
landlordRouter.delete('/:assignmentId', revokePropertyManagerHandler);

/**
 * @swagger
 * /api/landlord/property-managers/{assignmentId}/permissions:
 *   patch:
 *     summary: Update one assignment's granular permissions, unit restriction, and group-chat authorization
 *     description: >
 *       Property/assignment-scoped — never affects any other assignment the same PM holds.
 *       Group chat defaults to off and must be explicitly enabled here.
 *     tags: [Landlord, PropertyManager]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               permissions:
 *                 type: array
 *                 items: { type: string }
 *               unitIds:
 *                 type: array
 *                 items: { type: string }
 *                 nullable: true
 *               allowGroupChat: { type: boolean }
 *     responses:
 *       200:
 *         description: Updated assignment
 *       404:
 *         description: Assignment not found
 */
landlordRouter.patch('/:assignmentId/permissions', updateAssignmentPermissionsHandler);

/**
 * @swagger
 * /api/landlord/property-managers/{assignmentId}/invite:
 *   get:
 *     summary: Current activation-invite status for one assignment (Ticket 7 invitation status list)
 *     tags: [Landlord, PropertyManager]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: "{ status, email, sentAt, expiresAt, acceptedAt }"
 *       404:
 *         description: No invite found for this assignment
 */
landlordRouter.get('/:assignmentId/invite', getPMInviteStatusHandler);

/**
 * @swagger
 * /api/landlord/property-managers/{assignmentId}/invite/resend:
 *   post:
 *     summary: Resend the activation email and extend the invite's expiry
 *     tags: [Landlord, PropertyManager]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: "{ resent: true, expiresAt }"
 *       400:
 *         description: Cannot resend an accepted/declined/revoked invite
 */
landlordRouter.post('/:assignmentId/invite/resend', resendPMInviteHandler);

/**
 * @swagger
 * /api/landlord/property-managers/{assignmentId}/invite/revoke:
 *   post:
 *     summary: Revoke a not-yet-accepted invite — the activation link stops working immediately
 *     description: Only revokes the invite/login link. To also remove the PM's property access, call DELETE /:assignmentId separately.
 *     tags: [Landlord, PropertyManager]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: "{ revoked: true }"
 *       400:
 *         description: Already accepted or already revoked
 */
landlordRouter.post('/:assignmentId/invite/revoke', revokePMInviteHandler);


selfRouter.use(authMiddleware);
selfRouter.use(requireRole(['property_manager']));

/**
 * @swagger
 * /api/property-manager/my-properties:
 *   get:
 *     summary: Properties the authenticated property manager can access
 *     tags: [PropertyManager]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: assignments[] (propertyId, propertyName, permissions)
 */
selfRouter.get('/my-properties', listMyAssignmentsHandler);

/**
 * @swagger
 * /api/property-manager/context/landlords:
 *   get:
 *     summary: Distinct landlord (or own, for an independent PM) org contexts this PM has active assignments under
 *     description: Stateless multi-landlord switching — no server session; pass the chosen orgId as ?orgId= on every dashboard/records call below.
 *     tags: [PropertyManager, Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "{ landlords: [{ orgId, orgName, propertyCount, source }] }"
 */
selfRouter.get('/context/landlords', listLandlordContextsHandler);

/**
 * @swagger
 * /api/property-manager/dashboard/summary:
 *   get:
 *     summary: Dashboard summary cards for one landlord context, permission-gated per metric
 *     tags: [PropertyManager, Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: summary object — fields present only when at least one assigned property grants the relevant permission
 *       403:
 *         description: No active assignment in this organization
 */
selfRouter.get('/dashboard/summary', getDashboardSummaryHandler);

/**
 * @swagger
 * /api/property-manager/properties:
 *   get:
 *     summary: Assigned properties for one landlord context (VIEW_PROPERTY-gated, no debt/investor/equity/valuation fields)
 *     tags: [PropertyManager, Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: properties[]
 */
selfRouter.get('/properties', listPropertiesHandler);

/**
 * @swagger
 * /api/property-manager/units:
 *   get:
 *     summary: Assigned units for one landlord context (VIEW_UNITS-gated; rent only with VIEW_RENT_DATA; unit-level restriction honored)
 *     tags: [PropertyManager, Units]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: propertyId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: units[]
 *       403:
 *         description: Missing VIEW_UNITS permission on the requested property
 */
selfRouter.get('/units', listUnitsHandler);

/**
 * @swagger
 * /api/property-manager/tenants:
 *   get:
 *     summary: Tenant roster for one landlord context (VIEW_TENANTS-gated)
 *     tags: [PropertyManager, Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: propertyId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: tenants[]
 *       403:
 *         description: Missing VIEW_TENANTS permission on the requested property
 */
selfRouter.get('/tenants', listTenantsHandler);

/**
 * @swagger
 * /api/property-manager/leases:
 *   get:
 *     summary: Lease (tenancy) list for one landlord context (VIEW_LEASE_TERMS-gated; rentAmount only with VIEW_RENT_DATA)
 *     tags: [PropertyManager, Leases]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: propertyId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: leases[]
 *       403:
 *         description: Missing VIEW_LEASE_TERMS permission on the requested property
 */
selfRouter.get('/leases', listLeasesHandler);

/**
 * @swagger
 * /api/property-manager/maintenance:
 *   get:
 *     summary: List maintenance tickets on assigned properties (MAINTENANCE_VIEW-gated)
 *     description: >
 *       Previously a PM could update a ticket (SUBMIT_MAINTENANCE_UPDATES) but had no way to
 *       discover which tickets exist on their assigned properties — this closes that gap.
 *       Respects unit-level restriction if the assignment has one.
 *     tags: [PropertyManager, Maintenance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: propertyId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: tickets[]
 *       403:
 *         description: Missing MAINTENANCE_VIEW permission on the requested property
 */
selfRouter.get('/maintenance', listMaintenanceHandler);

/**
 * @swagger
 * /api/property-manager/chat/landlord-threads:
 *   post:
 *     summary: Start (or reuse) a direct chat with the landlord tied to this property assignment
 *     description: >
 *       The landlord's identity is always derived server-side from the assignment record, never
 *       taken from client input. Requires MESSAGE_LANDLORD on this property. 400 if the property
 *       has no landlord (independent RPA account).
 *     tags: [PropertyManager, Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [propertyId]
 *             properties:
 *               propertyId: { type: string }
 *     responses:
 *       200:
 *         description: Existing thread reused (isNew false)
 *       201:
 *         description: New thread created (isNew true)
 *       403:
 *         description: Not assigned to this property, or missing MESSAGE_LANDLORD permission
 */
selfRouter.post('/chat/landlord-threads', createPMLandlordThreadHandler);

/**
 * @swagger
 * /api/property-manager/chat/group-threads:
 *   post:
 *     summary: Start (or reuse) a 3-party group thread (Property Manager + landlord + tenant)
 *     description: >
 *       Requires MESSAGE_TENANT AND the assignment's allowGroupChat flag (off by default — the
 *       landlord must explicitly enable it via PATCH .../permissions). The tenant must have an
 *       active tenancy on a unit within this property (and within any unit-level restriction).
 *     tags: [PropertyManager, Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [propertyId, tenantUserId]
 *             properties:
 *               propertyId: { type: string }
 *               tenantUserId: { type: string }
 *     responses:
 *       200:
 *         description: Existing thread reused (isNew false)
 *       201:
 *         description: New thread created (isNew true)
 *       403:
 *         description: Not assigned, missing MESSAGE_TENANT, group chat not authorized, or tenant not on this property
 */
selfRouter.post('/chat/group-threads', createPMGroupThreadHandler);

/**
 * @swagger
 * /api/property-manager/rpa/rewards:
 *   get:
 *     summary: List the org's reward catalog (RPA_VIEW-gated, org-wide — reward catalog entries are not property-scoped)
 *     tags: [PropertyManager, RPA]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: rewards[]
 *       403:
 *         description: Missing RPA_VIEW permission
 *   post:
 *     summary: Create a reward catalog entry (RPA_CREATE_REWARD-gated)
 *     tags: [PropertyManager, RPA]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rewardId, title, description, costCredits, category]
 *             properties:
 *               rewardId: { type: string }
 *               title: { type: string }
 *               description: { type: string }
 *               costCredits: { type: number }
 *               category: { type: string }
 *               status: { type: string, enum: [active, inactive] }
 *     responses:
 *       201:
 *         description: reward
 *       403:
 *         description: Missing RPA_CREATE_REWARD permission
 */
selfRouter.get('/rpa/rewards', listRewardsHandler);
selfRouter.post('/rpa/rewards', createRewardHandler);

/**
 * @swagger
 * /api/property-manager/rpa/campaigns:
 *   get:
 *     summary: List reward campaigns visible to this PM (RPA_VIEW-gated, property-scoped)
 *     tags: [PropertyManager, RPA]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: propertyId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: "{ campaigns: [] }"
 *   post:
 *     summary: Create a reward campaign for one property (RPA_CREATE_CAMPAIGN-gated)
 *     tags: [PropertyManager, RPA]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [propertyId, goal, budget, eligibleBehaviors]
 *             properties:
 *               propertyId: { type: string }
 *               goal: { type: string }
 *               budget: { type: number }
 *               eligibleBehaviors:
 *                 type: array
 *                 items: { type: string, enum: [ON_TIME_RENT, MAINTENANCE_REPORTING] }
 *     responses:
 *       201:
 *         description: campaign
 *       403:
 *         description: Missing RPA_CREATE_CAMPAIGN permission on this property
 */
selfRouter.get('/rpa/campaigns', listCampaignsHandler);
selfRouter.post('/rpa/campaigns', createCampaignHandler);

/**
 * @swagger
 * /api/property-manager/rpa/challenges:
 *   get:
 *     summary: List tenant challenges visible to this PM (RPA_VIEW-gated, property-scoped)
 *     tags: [PropertyManager, RPA]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: propertyId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: "{ challenges: [] }"
 *   post:
 *     summary: Create a tenant challenge for one property (RPA_CREATE_CHALLENGE-gated)
 *     description: Recorded with creatorType PROPERTY_MANAGER.
 *     tags: [PropertyManager, RPA]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [propertyId, challengeId, title, description, rewardPoints, actionLabel]
 *             properties:
 *               propertyId: { type: string }
 *               challengeId: { type: string }
 *               title: { type: string }
 *               description: { type: string }
 *               rewardPoints: { type: integer }
 *               actionLabel: { type: string }
 *     responses:
 *       201:
 *         description: challenge
 *       403:
 *         description: Missing RPA_CREATE_CHALLENGE permission on this property
 */
selfRouter.get('/rpa/challenges', listChallengesHandler);
selfRouter.post('/rpa/challenges', createChallengeHandler);

/**
 * @swagger
 * /api/property-manager/rpa/redemptions/pending:
 *   get:
 *     summary: List pending reward redemptions for tenants on properties this PM manages (RPA_VIEW-gated)
 *     tags: [PropertyManager, RPA]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: "{ items: [] }"
 */
selfRouter.get('/rpa/redemptions/pending', listPendingRedemptionsHandler);

/**
 * @swagger
 * /api/property-manager/rpa/redemptions/{redemptionId}/review:
 *   patch:
 *     summary: Approve or reject a pending redemption (RPA_APPROVE_REDEMPTION-gated)
 *     description: Approving triggers the same fulfillment flow (gift card/rent credit/service) as the landlord path.
 *     tags: [PropertyManager, RPA]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: redemptionId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action: { type: string, enum: [APPROVE, REJECT] }
 *               rejectionReason: { type: string }
 *     responses:
 *       200:
 *         description: Updated redemption
 *       403:
 *         description: Missing RPA_APPROVE_REDEMPTION permission, or tenant not on a property this PM manages
 */
selfRouter.patch('/rpa/redemptions/:redemptionId/review', reviewRedemptionHandler);

/**
 * @swagger
 * /api/property-manager/rpa/tenants/{tenantUserId}/adjust-balance:
 *   post:
 *     summary: Adjust a tenant's reward credit balance with a required reason (RPA_ADJUST_BALANCE-gated)
 *     tags: [PropertyManager, RPA]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantUserId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [propertyId, amount, reason]
 *             properties:
 *               propertyId: { type: string }
 *               amount: { type: number }
 *               reason: { type: string }
 *     responses:
 *       200:
 *         description: Ledger event created
 *       403:
 *         description: Missing RPA_ADJUST_BALANCE permission, or tenant not on a unit this PM manages
 */
selfRouter.post('/rpa/tenants/:tenantUserId/adjust-balance', adjustBalanceHandler);

/**
 * @swagger
 * /api/property-manager/rpa/verifications:
 *   get:
 *     summary: List reward verifications on assigned properties (RPA_VIEW-gated)
 *     tags: [PropertyManager, RPA]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: propertyId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: verifications[]
 *   post:
 *     summary: Mark a tenant eligible for a reward behavior (RPA_CREATE_CAMPAIGN-gated)
 *     tags: [PropertyManager, RPA]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [propertyId, tenantUserId, eligibleBehavior]
 *             properties:
 *               propertyId: { type: string }
 *               unitId: { type: string }
 *               tenantUserId: { type: string }
 *               campaignId: { type: string }
 *               eligibleBehavior: { type: string }
 *               rewardType: { type: string }
 *               creditsRequested: { type: number }
 *     responses:
 *       201:
 *         description: Created verification (status ELIGIBLE)
 */
selfRouter.get('/rpa/verifications', listVerificationsHandler);
selfRouter.post('/rpa/verifications', markEligibleForVerificationHandler);

/**
 * @swagger
 * /api/property-manager/rpa/verifications/{verificationId}/review:
 *   patch:
 *     summary: Approve or deny a reward verification (RPA_APPROVE_REDEMPTION-gated)
 *     description: Approving issues RewardType points/credits via the ledger — never a TEPA ownership token.
 *     tags: [PropertyManager, RPA]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: verificationId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action: { type: string, enum: [APPROVE, DENY] }
 *               creditsAwarded: { type: number }
 *               denialReason: { type: string }
 *     responses:
 *       200:
 *         description: Updated verification (status ISSUED or DENIED)
 *       403:
 *         description: Missing RPA_APPROVE_REDEMPTION permission on this property
 */
selfRouter.patch('/rpa/verifications/:verificationId/review', reviewVerificationHandler);

/**
 * @swagger
 * /api/property-manager/rpa/verifications/{verificationId}/resolve-dispute:
 *   patch:
 *     summary: Resolve a disputed reward verification (RPA_APPROVE_REDEMPTION-gated)
 *     tags: [PropertyManager, RPA]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: verificationId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [outcome]
 *             properties:
 *               outcome: { type: string, enum: [UPHOLD, OVERTURN] }
 *               creditsAwarded: { type: number }
 *               resolutionNote: { type: string }
 *     responses:
 *       200:
 *         description: Updated verification (status RESOLVED)
 */
selfRouter.patch('/rpa/verifications/:verificationId/resolve-dispute', resolveVerificationDisputeHandler);

/**
 * @swagger
 * /api/property-manager/tepa/tenants/{tenantUserId}:
 *   get:
 *     summary: Read-only TEPA summary for one tenant (vesting, Good Standing, opt-in status, agreement record)
 *     description: TEPA_VIEW-gated. No mutation controls exist anywhere in this module — vesting, ledger, enrollment, and Good Standing are all read-only for a Property Manager.
 *     tags: [PropertyManager, TEPA]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantUserId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: propertyId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: summary
 *       403:
 *         description: Missing TEPA_VIEW permission, or tenant not on a unit this PM manages
 */
selfRouter.get('/tepa/tenants/:tenantUserId', getTenantTEPASummaryHandler);

/**
 * @swagger
 * /api/property-manager/tepa/tenants/{tenantUserId}/ledger:
 *   get:
 *     summary: Read-only token ledger entries for one tenant (TEPA_VIEW-gated)
 *     tags: [PropertyManager, TEPA]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantUserId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: propertyId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: "{ entries: [], balance: number }"
 */
selfRouter.get('/tepa/tenants/:tenantUserId/ledger', getTenantTokenLedgerHandler);

/**
 * @swagger
 * /api/property-manager/tepa/properties/{propertyId}/summary:
 *   get:
 *     summary: Property-level TEPA participation rollup (TEPA_VIEW-gated)
 *     tags: [PropertyManager, TEPA]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: "{ propertyId, participantCount, participants: [] }"
 */
selfRouter.get('/tepa/properties/:propertyId/summary', getPropertyTEPASummaryHandler);

/**
 * @swagger
 * /api/property-manager/tepa/properties/{propertyId}/valuation:
 *   get:
 *     summary: Annual valuation history + status for a property (TEPA_VIEW-gated, read-only)
 *     tags: [PropertyManager, TEPA]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: "{ status, latest, nextDueDate }"
 */
selfRouter.get('/tepa/properties/:propertyId/valuation', getPropertyValuationHandler);

/**
 * @swagger
 * /api/property-manager/tepa/properties/{propertyId}/agreements:
 *   get:
 *     summary: Agreement (Lease/RPA/TEPA) status for tenants on this property (TEPA_VIEW-gated, read-only)
 *     tags: [PropertyManager, TEPA]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: agreements[]
 */
selfRouter.get('/tepa/properties/:propertyId/agreements', listAgreementsForPMHandler);

/**
 * @swagger
 * /api/property-manager/compliance/properties/{propertyId}:
 *   get:
 *     summary: Compliance Center status for this property (VIEW_COMPLIANCE_STATUS-gated, read-only)
 *     description: This permission flag existed on the assignment model with nothing enforcing it — this closes that gap.
 *     tags: [PropertyManager, Compliance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: documents[]
 *       403:
 *         description: Missing VIEW_COMPLIANCE_STATUS permission on this property
 */
selfRouter.get('/compliance/properties/:propertyId', listComplianceForPMHandler);

/**
 * @swagger
 * /api/property-manager/tepa/liquidity:
 *   get:
 *     summary: Read-only liquidity request list for tenants on this property (TEPA_VIEW-gated)
 *     description: No review/deduct/ROFR/transfer actions exist on this endpoint — approving liquidity requests remains landlord-only, non-negotiable per product spec.
 *     tags: [PropertyManager, TEPA]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: propertyId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: "{ requests: [] }"
 */
selfRouter.get('/tepa/liquidity', listLiquidityRequestsHandler);

/**
 * @swagger
 * /api/property-manager/reports/{dataset}:
 *   get:
 *     summary: Export a property-scoped CSV report
 *     description: >
 *       Property-scoped equivalent of the landlord's /api/exports/:dataset — never org-wide.
 *       Gated by EXPORT_REPORTS (or TEPA_VIEW for token-ledger). Only includes data from
 *       properties this PM is assigned to and permitted on; a specific propertyId the PM
 *       isn't permitted on returns 403.
 *     tags: [PropertyManager, Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: dataset
 *         required: true
 *         schema:
 *           type: string
 *           enum: [tenant-roster, arrears, lease-expiration, maintenance, rewards-history, token-ledger, activity-log]
 *       - in: query
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: propertyId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: CSV file download
 *       400:
 *         description: Invalid dataset name
 *       403:
 *         description: Missing EXPORT_REPORTS (or TEPA_VIEW) permission on the requested property
 */
selfRouter.get('/reports/:dataset', exportDatasetHandler);

/**
 * @swagger
 * /api/property-manager/tenants:
 *   post:
 *     summary: Add a tenant to a unit (ADD_TENANT-gated)
 *     description: >
 *       Mirrors the landlord's tenant-invite flow (creates a PENDING tenancy + a real
 *       accept-invite record) scoped to the PM's own assignment. Respects unit-level
 *       restriction if the assignment has one.
 *     tags: [PropertyManager, Tenants]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [unitId, email, rentAmount, leaseStart, leaseEnd]
 *             properties:
 *               unitId: { type: string }
 *               email: { type: string }
 *               rentAmount: { type: number }
 *               leaseStart: { type: string }
 *               leaseEnd: { type: string }
 *     responses:
 *       201:
 *         description: "{ tenancyId, tenantUserId, email, propertyName, inviteUrl }"
 *       403:
 *         description: Missing ADD_TENANT permission, or unit outside assignment
 *       409:
 *         description: Unit already has an active or pending tenant
 */
selfRouter.post('/tenants', addTenantHandler);

/**
 * @swagger
 * /api/property-manager/maintenance/{ticketId}:
 *   patch:
 *     summary: Update a maintenance ticket (SUBMIT_MAINTENANCE_UPDATES-gated; reward fields require MAINTENANCE_AWARD_REWARD)
 *     tags: [PropertyManager, Maintenance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status: { type: string, enum: [OPEN, UNDER_REVIEW, IN_PROGRESS, RESOLVED, REJECTED, CLOSED] }
 *               note: { type: string }
 *               creditsToAward: { type: number }
 *               rewardEligible: { type: boolean }
 *               rewardDecision: { type: string, enum: [PENDING, APPROVED, DENIED] }
 *               attachments:
 *                 type: array
 *                 maxItems: 10
 *                 description: Completion-evidence files, from POST /maintenance/upload
 *                 items:
 *                   type: object
 *                   properties:
 *                     fileKey: { type: string }
 *                     fileName: { type: string }
 *                     fileType: { type: string }
 *     responses:
 *       200:
 *         description: Updated ticket
 *       403:
 *         description: Missing SUBMIT_MAINTENANCE_UPDATES (or MAINTENANCE_AWARD_REWARD for reward fields)
 */
selfRouter.patch('/maintenance/:ticketId', updateMaintenanceHandler);

/**
 * @swagger
 * /api/property-manager/maintenance/upload:
 *   post:
 *     summary: Upload a completion-evidence file for a maintenance ticket
 *     description: >
 *       Returns fileKey/fileName/fileType — pass the result in the `attachments` array of
 *       PATCH /maintenance/{ticketId}. Not property-scoped at upload time; the PATCH call
 *       still enforces SUBMIT_MAINTENANCE_UPDATES on the specific ticket's property.
 *     tags: [PropertyManager, Maintenance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: "{ fileKey, fileName, fileType }"
 *       400:
 *         description: Missing file
 */
selfRouter.post('/maintenance/upload', uploadSingle, maintenanceUploadHandler);

/**
 * @swagger
 * /api/property-manager/tenant-contacts:
 *   get:
 *     summary: Tenants the property manager can start a chat with
 *     description: Only tenants on properties the PM is actively assigned to with MESSAGE_TENANT permission.
 *     tags: [PropertyManager, Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: contacts[] (userId, name, email, propertyId, propertyName, unitNumber)
 */
selfRouter.get('/tenant-contacts', listTenantContactsHandler);

/**
 * @swagger
 * /api/property-manager/properties/{propertyId}/notes:
 *   get:
 *     summary: List property-management notes visible to the property manager
 *     description: Only returns LANDLORD_AND_PM visibility notes. 403 if the PM is not assigned to this property.
 *     tags: [PropertyManager, Notes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: notes[]
 *       403:
 *         description: Not assigned to this property
 *   post:
 *     summary: Create a note as the property manager (requires UPLOAD_NOTES permission)
 *     description: Visibility is always LANDLORD_AND_PM — a PM cannot create a landlord-only note.
 *     tags: [PropertyManager, Notes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [noteType, noteText]
 *             properties:
 *               unitId: { type: string }
 *               tenantId: { type: string }
 *               noteType:
 *                 type: string
 *                 enum: [PROPERTY, TENANT, MAINTENANCE, RENEWAL, PAYMENT, COMPLIANCE]
 *               noteText: { type: string, maxLength: 5000 }
 *     responses:
 *       201:
 *         description: Note created
 *       403:
 *         description: Missing UPLOAD_NOTES permission on this property
 */
selfRouter.get('/properties/:propertyId/notes', listNotesForPMHandler);
selfRouter.post('/properties/:propertyId/notes', createNoteAsPMHandler);

export { landlordRouter as propertyManagerLandlordRoutes, selfRouter as propertyManagerSelfRoutes };
