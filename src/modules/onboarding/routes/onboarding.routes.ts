import { Router } from 'express';
import passport from 'passport';
import { validateRequest } from '../../../middleware/validate.middleware';
import { rejectInterestHandler } from '../controllers/interest-reject.controller';
import { authMiddleware } from '../../../middleware/authMiddleware';
import { uploadSingle } from '../../docs/middleware/upload.middleware';
import {
  getOnboardingStatus,
  submitOnboardingStepHandler,
  uploadOnboardingDocumentHandler,
  verifyOnboardingDocumentHandler,
} from '../controllers/onboarding.controller';
import { evaluateRiskBadgesHandler } from '../controllers/riskBadge.controller';
import {
  upsertExtractionFieldsHandler,
  recordOverrideHandler,
  confirmFieldsHandler,
  getFieldsHandler,
  getUnconfirmedHandler,
} from '../controllers/extractionConfirmation.controller';
import {
  createCommunityAccountHandler,
  verifyCommunityEmailOtpHandler,
  getCommunityDataVisibilityPrivacyHandler,
  getCommunityImpactGoalsHandler,
  getCommunityOrganizationInformationHandler,
  getCommunityProgramAssociationHandler,
  getCommunityReviewActivateHandler,
  getCommunityStakeholderTypeHandler,
  getCommunityStakeholderDashboardProfileHandler,
  generateCommunityInviteLinkHandler,
  saveCommunityDataVisibilityPrivacyHandler,
  saveCommunityImpactGoalsHandler,
  saveCommunityOrganizationInformationHandler,
  saveCommunityProgramAssociationHandler,
  saveCommunityReviewActivateHandler,
  saveCommunityStakeholderTypeHandler,
  listCommunityInterestHandler,
  resolveCommunityInviteHandler,
  submitCommunityInterestHandler,
} from '../controllers/community-interest.controller';
import {
  createInvestorAccountHandler,
  verifyInvestorEmailOtpHandler,
  generateInvestorInviteLinkHandler,
  getInvestorAllSetHandler,
  getInvestorInvestmentPreferencesHandler,
  getInvestorLegalAcknowledgmentsHandler,
  getInvestorStatusAcknowledgmentHandler,
  listInvestorInterestHandler,
  resolveInvestorInviteHandler,
  saveInvestorAllSetHandler,
  saveInvestorInvestmentPreferencesHandler,
  saveInvestorLegalAcknowledgmentsHandler,
  saveInvestorStatusAcknowledgmentHandler,
  submitInvestorInterestHandler,
} from '../controllers/investor-interest.controller';
import {
  createLandlordAccountHandler,
  verifyLandlordEmailOtpHandler,
  getLandlordComplianceAcknowledgementsHandler,
  generateLandlordInviteLinkHandler,
  getLandlordComplianceDocumentsHandler,
  getLandlordFrameworkAcknowledgementHandler,
  getLandlordProgramEconomicsRulesHandler,
  getLandlordProgramSelectionHandler,
  getLandlordPropertyDetailsHandler,
  getLandlordReviewActivateHandler,
  listLandlordInterestHandler,
  resolveLandlordInviteHandler,
  saveLandlordComplianceAcknowledgementsHandler,
  saveLandlordComplianceDocumentsHandler,
  saveLandlordFrameworkAcknowledgementHandler,
  saveLandlordProgramEconomicsRulesHandler,
  saveLandlordProgramSelectionHandler,
  saveLandlordPropertyDetailsHandler,
  saveLandlordReviewActivateHandler,
  submitLandlordInterestHandler,
} from '../controllers/landlord-interest.controller';
import {
  createTenantAccountHandler,
  verifyTenantEmailOtpHandler,
  getTenantDashboardWalkthroughHandler,
  getTenantLeaseAssociationHandler,
  generateTenantInviteLinkHandler,
  getTenantIdentityVerificationHandler,
  getTenantParticipationStatusHandler,
  getTenantProgramExplanationHandler,
  listTenantInterestHandler,
  lookupTenantLeaseAssociationHandler,
  resolveTenantInviteHandler,
  saveTenantDashboardWalkthroughHandler,
  saveTenantLeaseAssociationHandler,
  saveTenantIdentityVerificationHandler,
  saveTenantParticipationStatusHandler,
  saveTenantProgramExplanationHandler,
  submitTenantInterestHandler,
} from '../controllers/tenant-interest.controller';
import {
  submitOnboardingStepSchema,
  uploadOnboardingDocumentSchema,
  verifyOnboardingDocumentSchema,
} from '../validators/onboarding.validators';
import {
  communityDataVisibilityPrivacySchema,
  communityImpactGoalsSchema,
  communityOrganizationInformationSchema,
  communityProgramAssociationSchema,
  communityReviewActivateSchema,
  communityStakeholderTypeSchema,
  createCommunityAccountSchema,
  createCommunityInterestSchema,
  generateCommunityInviteLinkSchema,
  listCommunityInterestSchema,
  resolveCommunityInviteSchema,
} from '../validators/community-interest.validators';
import {
  investorAllSetSchema,
  createInvestorAccountSchema,
  createInvestorInterestSchema,
  generateInvestorInviteLinkSchema,
  investorInvestmentPreferencesSchema,
  investorLegalAcknowledgmentsSchema,
  investorStatusAcknowledgmentSchema,
  listInvestorInterestSchema,
  resolveInvestorInviteSchema,
} from '../validators/investor-interest.validators';
import {
  createLandlordAccountSchema,
  createLandlordInterestSchema,
  generateLandlordInviteLinkSchema,
  landlordComplianceAcknowledgementsSchema,
  landlordComplianceDocumentsSchema,
  landlordFrameworkAcknowledgementSchema,
  landlordProgramEconomicsRulesSchema,
  landlordProgramSelectionSchema,
  landlordPropertyDetailsSchema,
  landlordReviewActivateSchema,
  listLandlordInterestSchema,
  resolveLandlordInviteSchema,
} from '../validators/landlord-interest.validators';
import {
  createTenantAccountSchema,
  createTenantInterestSchema,
  generateTenantInviteLinkSchema,
  listTenantInterestSchema,
  resolveTenantInviteSchema,
  tenantDashboardWalkthroughSchema,
  tenantLeaseAssociationLookupSchema,
  tenantLeaseAssociationSchema,
  tenantIdentityVerificationSchema,
  tenantParticipationStatusSchema,
  tenantProgramExplanationSchema,
} from '../validators/tenant-interest.validators';

const router = Router();

/**
 * @openapi
 * /api/onboarding/community/interest:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Submit community partner interest form
 *     description: Public endpoint for community partner or stakeholder submissions before invite generation.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - email
 *               - organizationName
 *               - stakeholderType
 *               - titleOrRoleAtOrganization
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               email: { type: string, format: email }
 *               organizationName: { type: string }
 *               stakeholderType: { type: string }
 *               titleOrRoleAtOrganization: { type: string }
 *               phoneNumber: { type: string, example: "+15551234567" }
 *               cityOrRegionServed: { type: string }
 *               messageContext: { type: string }
 *     responses:
 *       201:
 *         description: Community interest submitted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.post(
  '/onboarding/community/interest',
  validateRequest(createCommunityInterestSchema),
  submitCommunityInterestHandler
);

/**
 * @openapi
 * /api/onboarding/community/invite/resolve:
 *   get:
 *     tags:
 *       - Onboarding
 *     summary: Resolve community invite token
 *     description: Public endpoint used by frontend community onboarding page to validate invite and fetch prefill data.
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Admin-generated onboarding invite token
 *     responses:
 *       200:
 *         description: Invite resolved successfully
 *       401:
 *         description: Invalid or expired token
 *       409:
 *         description: Invite already consumed
 */
router.get(
  '/onboarding/community/invite/resolve',
  validateRequest(resolveCommunityInviteSchema),
  resolveCommunityInviteHandler
);

/**
 * @openapi
 * /api/onboarding/community/create-account:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Community onboarding create account
 *     description: Creates a community or community stakeholder user from an admin-generated invite token and returns JWT.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [onboardingToken, investorType, firstName, lastName, email, password, confirmPassword, countryOfResidence]
 *             properties:
 *               onboardingToken: { type: string }
 *               investorType:
 *                 type: string
 *                 enum: [INDIVIDUAL_INVESTOR, INVESTING_ON_BEHALF_OF_A_FIRM]
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               confirmPassword: { type: string, minLength: 8 }
 *               phoneNumber: { type: string, example: "+15551234567" }
 *               countryOfResidence: { type: string }
 *               linkedinUrl: { type: string, format: uri }
 *               jobTitle: { type: string }
 *               legalCompanyName: { type: string }
 *               streetAddress: { type: string }
 *               companyCountry: { type: string }
 *               companyStateOrProvince: { type: string }
 *               companyCity: { type: string }
 *               companyEmail: { type: string, format: email }
 *               companyPhoneNumber: { type: string, example: "+15551234567" }
 *     responses:
 *       201:
 *         description: Account created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid or expired invite token
 *       409:
 *         description: Email already exists or invite consumed
 */
router.post(
  '/onboarding/community/create-account',
  validateRequest(createCommunityAccountSchema),
  createCommunityAccountHandler
);

router.post(
  '/onboarding/community/verify-email',
  passport.authenticate('jwt', { session: false }),
  verifyCommunityEmailOtpHandler
);

/**
 * @openapi
 * /api/onboarding/investor/interest:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Submit investor interest form
 *     description: Public endpoint for investor access requests before invite generation.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - email
 *               - investorType
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               email: { type: string, format: email }
 *               investorType: { type: string }
 *               phoneNumber: { type: string, example: "+15551234567" }
 *               typicalCheckSize: { type: string }
 *               linkedinUrl: { type: string, format: uri }
 *               message: { type: string }
 *     responses:
 *       201:
 *         description: Investor interest submitted
 *       400:
 *         description: Validation error
 */
router.post(
  '/onboarding/investor/interest',
  validateRequest(createInvestorInterestSchema),
  submitInvestorInterestHandler
);

/**
 * @openapi
 * /api/onboarding/investor/invite/resolve:
 *   get:
 *     tags:
 *       - Onboarding
 *     summary: Resolve investor invite token
 *     description: Public endpoint used by frontend investor onboarding page to validate invite and fetch prefill data.
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Admin-generated onboarding invite token
 *     responses:
 *       200:
 *         description: Invite resolved successfully
 *       401:
 *         description: Invalid or expired token
 *       409:
 *         description: Invite already consumed
 */
router.get(
  '/onboarding/investor/invite/resolve',
  validateRequest(resolveInvestorInviteSchema),
  resolveInvestorInviteHandler
);

/**
 * @openapi
 * /api/onboarding/investor/create-account:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Investor onboarding create account
 *     description: Creates an investor user from an admin-generated invite token and returns JWT.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [onboardingToken, investorType, firstName, lastName, email, password, confirmPassword, countryOfResidence]
 *             properties:
 *               onboardingToken: { type: string }
 *               investorType:
 *                 type: string
 *                 enum: [INDIVIDUAL_INVESTOR, INVESTING_ON_BEHALF_OF_A_FIRM]
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               confirmPassword: { type: string, minLength: 8 }
 *               phoneNumber: { type: string, example: "+15551234567" }
 *               countryOfResidence: { type: string }
 *               linkedinUrl: { type: string, format: uri }
 *               jobTitle: { type: string }
 *               legalCompanyName: { type: string }
 *               streetAddress: { type: string }
 *               companyCountry: { type: string }
 *               companyStateOrProvince: { type: string }
 *               companyCity: { type: string }
 *               companyEmail: { type: string, format: email }
 *               companyPhoneNumber: { type: string, example: "+15551234567" }
 *     responses:
 *       201:
 *         description: Account created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid or expired invite token
 *       409:
 *         description: Email already exists or invite consumed
 */
router.post(
  '/onboarding/investor/create-account',
  validateRequest(createInvestorAccountSchema),
  createInvestorAccountHandler
);

router.post(
  '/onboarding/investor/verify-email',
  passport.authenticate('jwt', { session: false }),
  verifyInvestorEmailOtpHandler
);

/**
 * @openapi
 * /api/onboarding/investor/status-acknowledgment:
 *   get:
 *     tags:
 *       - Onboarding
 *     summary: Get investor status acknowledgment step
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Investor status acknowledgment payload
 *       400:
 *         description: Create-account step not completed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Investor only
 */
router.get(
  '/onboarding/investor/status-acknowledgment',
  passport.authenticate('jwt', { session: false }),
  getInvestorStatusAcknowledgmentHandler
);

/**
 * @openapi
 * /api/onboarding/investor/status-acknowledgment:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Save investor status acknowledgment step
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - confirmsAccreditedInvestorStatus
 *               - understandsNoGovernanceOccupancyOwnershipRights
 *               - acknowledgesVerificationOccursOutsidePlatform
 *             properties:
 *               confirmsAccreditedInvestorStatus: { type: boolean, enum: [true] }
 *               understandsNoGovernanceOccupancyOwnershipRights: { type: boolean, enum: [true] }
 *               acknowledgesVerificationOccursOutsidePlatform: { type: boolean, enum: [true] }
 *     responses:
 *       200:
 *         description: Investor status acknowledgment saved
 *       400:
 *         description: Validation error or prior step missing
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Investor only
 */
router.post(
  '/onboarding/investor/status-acknowledgment',
  passport.authenticate('jwt', { session: false }),
  validateRequest(investorStatusAcknowledgmentSchema),
  saveInvestorStatusAcknowledgmentHandler
);

/**
 * @openapi
 * /api/onboarding/investor/investment-preferences:
 *   get:
 *     tags:
 *       - Onboarding
 *     summary: Get investor investment preferences step
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Investor investment preferences payload
 *       400:
 *         description: Investor status acknowledgment step not completed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Investor only
 */
router.get(
  '/onboarding/investor/investment-preferences',
  passport.authenticate('jwt', { session: false }),
  getInvestorInvestmentPreferencesHandler
);

/**
 * @openapi
 * /api/onboarding/investor/investment-preferences:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Save investor investment preferences step
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - portfolioExposure
 *               - geography
 *               - riskProfile
 *             properties:
 *               portfolioExposure:
 *                 type: string
 *                 enum: [PORTFOLIO_LEVEL_EXPOSURE, PROPERTY_LEVEL_SUMMARIES, UNIT_LEVEL_SUMMARIES]
 *               geography:
 *                 type: string
 *                 enum: [TEXAS, CALIFORNIA, FLORIDA, NATIONAL]
 *               riskProfile:
 *                 type: string
 *                 enum: [CONSERVATIVE, BALANCED, GROWTH]
 *     responses:
 *       200:
 *         description: Investor investment preferences saved
 *       400:
 *         description: Validation error or prior step missing
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Investor only
 */
router.post(
  '/onboarding/investor/investment-preferences',
  passport.authenticate('jwt', { session: false }),
  validateRequest(investorInvestmentPreferencesSchema),
  saveInvestorInvestmentPreferencesHandler
);

/**
 * @openapi
 * /api/onboarding/investor/legal-acknowledgments:
 *   get:
 *     tags:
 *       - Onboarding
 *     summary: Get investor legal acknowledgments step
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Investor legal acknowledgments payload
 *       400:
 *         description: Investment preferences step not completed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Investor only
 */
router.get(
  '/onboarding/investor/legal-acknowledgments',
  passport.authenticate('jwt', { session: false }),
  getInvestorLegalAcknowledgmentsHandler
);

/**
 * @openapi
 * /api/onboarding/investor/legal-acknowledgments:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Save investor legal acknowledgments step
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - understandsNoGovernanceOrVotingRights
 *               - understandsNoOccupancyOrTenantRights
 *               - understandsReturnsAreNotGuaranteed
 *               - acknowledgesEconomicParticipationOnly
 *             properties:
 *               understandsNoGovernanceOrVotingRights: { type: boolean, enum: [true] }
 *               understandsNoOccupancyOrTenantRights: { type: boolean, enum: [true] }
 *               understandsReturnsAreNotGuaranteed: { type: boolean, enum: [true] }
 *               acknowledgesEconomicParticipationOnly: { type: boolean, enum: [true] }
 *     responses:
 *       200:
 *         description: Investor legal acknowledgments saved
 *       400:
 *         description: Validation error or prior step missing
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Investor only
 */
router.post(
  '/onboarding/investor/legal-acknowledgments',
  passport.authenticate('jwt', { session: false }),
  validateRequest(investorLegalAcknowledgmentsSchema),
  saveInvestorLegalAcknowledgmentsHandler
);

/**
 * @openapi
 * /api/onboarding/investor/all-set:
 *   get:
 *     tags:
 *       - Onboarding
 *     summary: Get investor final completion step
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Investor final completion payload
 *       400:
 *         description: Legal acknowledgments step not completed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Investor only
 */
router.get(
  '/onboarding/investor/all-set',
  passport.authenticate('jwt', { session: false }),
  getInvestorAllSetHandler
);

/**
 * @openapi
 * /api/onboarding/investor/all-set:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Complete investor onboarding
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - certificationAccepted
 *             properties:
 *               certificationAccepted: { type: boolean, enum: [true] }
 *     responses:
 *       200:
 *         description: Investor onboarding completed
 *       400:
 *         description: Validation error or prior step missing
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Investor only
 */
router.post(
  '/onboarding/investor/all-set',
  passport.authenticate('jwt', { session: false }),
  validateRequest(investorAllSetSchema),
  saveInvestorAllSetHandler
);

/**
 * @openapi
 * /api/onboarding/community/organization-information:
 *   get:
 *     tags:
 *       - Onboarding
 *     summary: Get saved community organization information (step 2)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Saved community organization information payload
 *       400:
 *         description: Create-account step not completed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Community only
 */
router.get(
  '/onboarding/community/organization-information',
  passport.authenticate('jwt', { session: false }),
  getCommunityOrganizationInformationHandler
);

/**
 * @openapi
 * /api/onboarding/community/organization-information:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Community onboarding step 2 (Organization Information)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - organizationName
 *               - department
 *               - jurisdiction
 *               - role
 *             properties:
 *               organizationName: { type: string, example: "City of Austin Housing Department" }
 *               department: { type: string, example: "Office of Housing Stability" }
 *               jurisdiction: { type: string, example: "Austin, Texas" }
 *               role: { type: string, example: "Community Stakeholder" }
 *     responses:
 *       200:
 *         description: Organization information saved
 *       400:
 *         description: Validation error or create-account step missing
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Community only
 */
router.post(
  '/onboarding/community/organization-information',
  passport.authenticate('jwt', { session: false }),
  validateRequest(communityOrganizationInformationSchema),
  saveCommunityOrganizationInformationHandler
);

/**
 * @openapi
 * /api/onboarding/community/stakeholder-type:
 *   get:
 *     tags:
 *       - Onboarding
 *     summary: Get saved community stakeholder type (step 3)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Saved community stakeholder type payload
 *       400:
 *         description: Organization information step not completed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Community only
 */
router.get(
  '/onboarding/community/stakeholder-type',
  passport.authenticate('jwt', { session: false }),
  getCommunityStakeholderTypeHandler
);

router.get(
  '/onboarding/community/dashboard-profile',
  passport.authenticate('jwt', { session: false }),
  getCommunityStakeholderDashboardProfileHandler
);

/**
 * @openapi
 * /api/onboarding/community/stakeholder-type:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Community onboarding step 3 (Stakeholder Type)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - stakeholderType
 *             properties:
 *               stakeholderType:
 *                 type: string
 *                 enum:
 *                   - HOUSING_AUTHORITY
 *                   - ECONOMIC_DEVELOPMENT_OFFICE
 *                   - COMMUNITY_LAND_TRUST
 *                   - PUBLIC_UNIVERSITY_OR_INSTITUTION
 *                   - OTHER_PUBLIC_AGENCY
 *     responses:
 *       200:
 *         description: Stakeholder type saved
 *       400:
 *         description: Validation error or organization information step missing
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Community only
 */
router.post(
  '/onboarding/community/stakeholder-type',
  passport.authenticate('jwt', { session: false }),
  validateRequest(communityStakeholderTypeSchema),
  saveCommunityStakeholderTypeHandler
);

/**
 * @openapi
 * /api/onboarding/community/program-association:
 *   get:
 *     tags:
 *       - Onboarding
 *     summary: Get saved community program association (step 4)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Saved community program association payload
 *       400:
 *         description: Stakeholder type step not completed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Community only
 */
router.get(
  '/onboarding/community/program-association',
  passport.authenticate('jwt', { session: false }),
  getCommunityProgramAssociationHandler
);

/**
 * @openapi
 * /api/onboarding/community/program-association:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Community onboarding step 4 (Program Association)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectIds
 *               - oversightLevel
 *             properties:
 *               projectIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               oversightLevel:
 *                 type: string
 *                 enum:
 *                   - PORTFOLIO_LEVEL_OVERVIEW
 *                   - PROJECT_LEVEL_VISIBILITY
 *     responses:
 *       200:
 *         description: Program association saved
 *       400:
 *         description: Validation error or stakeholder type step missing
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Community only
 *       404:
 *         description: One or more selected projects not found
 */
router.post(
  '/onboarding/community/program-association',
  passport.authenticate('jwt', { session: false }),
  validateRequest(communityProgramAssociationSchema),
  saveCommunityProgramAssociationHandler
);

/**
 * @openapi
 * /api/onboarding/community/data-visibility-privacy:
 *   get:
 *     tags:
 *       - Onboarding
 *     summary: Get saved community data visibility and privacy payload (step 5)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Saved community data visibility and privacy payload
 *       400:
 *         description: Program association step not completed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Community only
 */
router.get(
  '/onboarding/community/data-visibility-privacy',
  passport.authenticate('jwt', { session: false }),
  getCommunityDataVisibilityPrivacyHandler
);

/**
 * @openapi
 * /api/onboarding/community/data-visibility-privacy:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Community onboarding step 5 (Data Visibility & Privacy)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               acknowledgedVisibilityRules:
 *                 type: boolean
 *               reviewed:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Data visibility and privacy reviewed
 *       400:
 *         description: Validation error or program association step missing
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Community only
 */
router.post(
  '/onboarding/community/data-visibility-privacy',
  passport.authenticate('jwt', { session: false }),
  validateRequest(communityDataVisibilityPrivacySchema),
  saveCommunityDataVisibilityPrivacyHandler
);

/**
 * @openapi
 * /api/onboarding/community/impact-goals:
 *   get:
 *     tags:
 *       - Onboarding
 *     summary: Get saved community impact goals payload (step 6)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Saved community impact goals payload
 *       400:
 *         description: Data visibility and privacy step not completed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Community only
 */
router.get(
  '/onboarding/community/impact-goals',
  passport.authenticate('jwt', { session: false }),
  getCommunityImpactGoalsHandler
);

/**
 * @openapi
 * /api/onboarding/community/impact-goals:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Community onboarding step 6 (Impact Goals)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - impactGoals
 *               - acknowledgedOversightAccessAndExitRules
 *             properties:
 *               impactGoals:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum:
 *                     - HOUSING_STABILITY_AND_TENANT_RETENTION
 *                     - LOCAL_JOB_CREATION
 *                     - LOCAL_VENDOR_AND_SMALL_BUSINESS_USAGE
 *                     - ESG_AND_COMMUNITY_COMMITMENTS
 *               acknowledgedOversightAccessAndExitRules:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Impact goals saved
 *       400:
 *         description: Validation error or data visibility and privacy step missing
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Community only
 */
router.post(
  '/onboarding/community/impact-goals',
  passport.authenticate('jwt', { session: false }),
  validateRequest(communityImpactGoalsSchema),
  saveCommunityImpactGoalsHandler
);

/**
 * @openapi
 * /api/onboarding/community/review-activate:
 *   get:
 *     tags:
 *       - Onboarding
 *     summary: Get saved community review and activate payload (step 7)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Saved community review and activation payload
 *       400:
 *         description: Impact goals step not completed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Community only
 */
router.get(
  '/onboarding/community/review-activate',
  passport.authenticate('jwt', { session: false }),
  getCommunityReviewActivateHandler
);

/**
 * @openapi
 * /api/onboarding/community/review-activate:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Community onboarding step 7 (Review & Activate)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               certificationAccepted:
 *                 type: boolean
 *               authorizedAccessCertification:
 *                 type: boolean
 *               certifyAndActivate:
 *                 type: boolean
 *               confirmActivate:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Community onboarding activated
 *       400:
 *         description: Validation error or impact goals step missing
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Community only
 */
router.post(
  '/onboarding/community/review-activate',
  passport.authenticate('jwt', { session: false }),
  validateRequest(communityReviewActivateSchema),
  saveCommunityReviewActivateHandler
);

/**
 * @openapi
 * /api/onboarding/landlord/interest:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Submit landlord interest form
 *     description: Public endpoint for "Apply as Landlord" submissions before onboarding invite is generated.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - email
 *               - propertyType
 *               - titleOrRoleAtOrganization
 *               - country
 *               - stateOrProvince
 *               - city
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               email: { type: string, format: email }
 *               propertyType: { type: string }
 *               titleOrRoleAtOrganization: { type: string }
 *               country: { type: string }
 *               stateOrProvince: { type: string }
 *               city: { type: string }
 *               phoneNumber: { type: string, example: "+15551234567" }
 *               numberOfUnitsRange: { type: string }
 *               messageNotes: { type: string }
 *     responses:
 *       201:
 *         description: Landlord interest submitted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.post(
  '/onboarding/landlord/interest',
  validateRequest(createLandlordInterestSchema),
  submitLandlordInterestHandler
);

/**
 * @openapi
 * /api/onboarding/tenant/interest:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Submit tenant eligibility form
 *     description: Public endpoint for tenant interest/eligibility submissions before onboarding invite is generated.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - email
 *               - country
 *               - stateOrProvince
 *               - city
 *               - currentHousingType
 *               - propertyAddress
 *               - propertyCountry
 *               - propertyStateOrProvince
 *               - propertyCity
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               email: { type: string, format: email }
 *               country: { type: string }
 *               stateOrProvince: { type: string }
 *               city: { type: string }
 *               currentHousingType: { type: string }
 *               propertyAddress: { type: string }
 *               propertyCountry: { type: string }
 *               propertyStateOrProvince: { type: string }
 *               propertyCity: { type: string }
 *               phoneNumber: { type: string, example: "+15551234567" }
 *               landlordOrPropertyManagerName: { type: string }
 *               message: { type: string }
 *     responses:
 *       201:
 *         description: Tenant interest submitted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.post(
  '/onboarding/tenant/interest',
  validateRequest(createTenantInterestSchema),
  submitTenantInterestHandler
);

/**
 * @openapi
 * /api/onboarding/landlord/invite/resolve:
 *   get:
 *     tags:
 *       - Onboarding
 *     summary: Resolve landlord invite token
 *     description: Public endpoint used by frontend onboarding page to validate invite and fetch prefill data.
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Admin-generated onboarding invite token
 *     responses:
 *       200:
 *         description: Invite resolved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       401:
 *         description: Invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       409:
 *         description: Invite already consumed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get(
  '/onboarding/landlord/invite/resolve',
  validateRequest(resolveLandlordInviteSchema),
  resolveLandlordInviteHandler
);

/**
 * @openapi
 * /api/onboarding/tenant/invite/resolve:
 *   get:
 *     tags:
 *       - Onboarding
 *     summary: Resolve tenant invite token
 *     description: Public endpoint used by frontend tenant onboarding page to validate invite and fetch prefill data.
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Admin-generated onboarding invite token
 *     responses:
 *       200:
 *         description: Invite resolved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       401:
 *         description: Invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       409:
 *         description: Invite already consumed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get(
  '/onboarding/tenant/invite/resolve',
  validateRequest(resolveTenantInviteSchema),
  resolveTenantInviteHandler
);

/**
 * @openapi
 * /api/onboarding/landlord/create-account:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Landlord onboarding step 1 (Create Account)
 *     description: Creates landlord user from an admin-generated invite token and returns JWT.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [onboardingToken, email, password, confirmPassword]
 *             properties:
 *               onboardingToken: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               confirmPassword: { type: string, minLength: 8 }
 *               phone: { type: string, example: "+15551234567" }
 *               roleSelection:
 *                 type: string
 *                 enum: [LANDLORD, DEVELOPER]
 *     responses:
 *       201:
 *         description: Account created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid/expired invite token
 *       409:
 *         description: Email already exists or invite consumed
 */
router.post(
  '/onboarding/landlord/create-account',
  validateRequest(createLandlordAccountSchema),
  createLandlordAccountHandler
);

router.post(
  '/onboarding/landlord/verify-email',
  passport.authenticate('jwt', { session: false }),
  verifyLandlordEmailOtpHandler
);

/**
 * @openapi
 * /api/onboarding/tenant/create-account:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Tenant onboarding create account
 *     description: Creates a tenant account. Pass onboardingToken when coming from a landlord invite link; omit it for direct sign-up.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, confirmPassword]
 *             properties:
 *               onboardingToken: { type: string, description: "Optional — only present when tenant arrives via an invite link" }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               confirmPassword: { type: string, minLength: 8 }
 *               phone: { type: string, example: "+15551234567" }
 *     responses:
 *       201:
 *         description: Account created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid or expired invite token
 *       409:
 *         description: Email already exists or invite consumed
 */
router.post(
  '/onboarding/tenant/create-account',
  validateRequest(createTenantAccountSchema),
  createTenantAccountHandler
);

router.post(
  '/onboarding/tenant/verify-email',
  passport.authenticate('jwt', { session: false }),
  verifyTenantEmailOtpHandler
);

/**
 * @openapi
 * /api/onboarding/tenant/identity-verification:
 *   get:
 *     tags:
 *       - Onboarding
 *     summary: Get saved tenant identity verification (step 2)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Saved tenant identity verification payload
 *       400:
 *         description: Create-account step not completed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Tenant only
 */
router.get(
  '/onboarding/tenant/identity-verification',
  passport.authenticate('jwt', { session: false }),
  getTenantIdentityVerificationHandler
);

/**
 * @openapi
 * /api/onboarding/tenant/identity-verification:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Tenant onboarding step 2 (Identity Verification)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fullName
 *               - dateOfBirth
 *               - phoneNumber
 *               - acceptedTermsAndPrivacyPolicy
 *             properties:
 *               fullName: { type: string, example: "Blessing Sunday" }
 *               dateOfBirth: { type: string, example: "1995-08-12" }
 *               phoneNumber: { type: string, example: "+15551234567" }
 *               acceptedTermsAndPrivacyPolicy: { type: boolean, example: true }
 *     responses:
 *       200:
 *         description: Identity verification saved
 *       400:
 *         description: Validation error or create-account step missing
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Tenant only
 */
router.post(
  '/onboarding/tenant/identity-verification',
  passport.authenticate('jwt', { session: false }),
  validateRequest(tenantIdentityVerificationSchema),
  saveTenantIdentityVerificationHandler
);

/**
 * @openapi
 * /api/onboarding/tenant/lease-association:
 *   get:
 *     tags:
 *       - Onboarding
 *     summary: Get saved tenant lease association (step 3)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Saved tenant lease association payload
 *       400:
 *         description: Identity verification step not completed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Tenant only
 */
router.get(
  '/onboarding/tenant/lease-association',
  passport.authenticate('jwt', { session: false }),
  getTenantLeaseAssociationHandler
);

/**
 * @openapi
 * /api/onboarding/tenant/lease-association/lookup:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Lookup property and units by property code for tenant step 3
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - propertyCode
 *             properties:
 *               propertyCode: { type: string, example: "KP-45892" }
 *     responses:
 *       200:
 *         description: Property and units resolved
 *       400:
 *         description: Validation error or identity verification step missing
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Tenant only
 *       404:
 *         description: Property not found
 */
router.post(
  '/onboarding/tenant/lease-association/lookup',
  passport.authenticate('jwt', { session: false }),
  validateRequest(tenantLeaseAssociationLookupSchema),
  lookupTenantLeaseAssociationHandler
);

/**
 * @openapi
 * /api/onboarding/tenant/lease-association:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Tenant onboarding step 3 (Lease Association)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - propertyCode
 *               - unitId
 *             properties:
 *               propertyCode: { type: string, example: "KP-45892" }
 *               unitId: { type: string, example: "67d5f5029c94f4b415a4e012" }
 *     responses:
 *       200:
 *         description: Lease association saved
 *       400:
 *         description: Validation error or selected unit mismatch
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Tenant only
 *       404:
 *         description: Property not found
 */
router.post(
  '/onboarding/tenant/lease-association',
  passport.authenticate('jwt', { session: false }),
  validateRequest(tenantLeaseAssociationSchema),
  saveTenantLeaseAssociationHandler
);

/**
 * @openapi
 * /api/onboarding/tenant/program-explanation:
 *   get:
 *     tags:
 *       - Onboarding
 *     summary: Get tenant program explanation (step 4)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tenant program explanation payload
 *       400:
 *         description: Lease association step not completed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Tenant only
 */
router.get(
  '/onboarding/tenant/program-explanation',
  passport.authenticate('jwt', { session: false }),
  getTenantProgramExplanationHandler
);

/**
 * @openapi
 * /api/onboarding/tenant/program-explanation:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Confirm tenant program explanation acknowledgement (step 4)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - acknowledgedNoOwnership
 *             properties:
 *               acknowledgedNoOwnership: { type: boolean, example: true }
 *     responses:
 *       200:
 *         description: Program explanation acknowledged
 *       400:
 *         description: Validation error or lease association step missing
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Tenant only
 */
router.post(
  '/onboarding/tenant/program-explanation',
  passport.authenticate('jwt', { session: false }),
  validateRequest(tenantProgramExplanationSchema),
  saveTenantProgramExplanationHandler
);

/**
 * @openapi
 * /api/onboarding/tenant/participation-status:
 *   get:
 *     tags:
 *       - Onboarding
 *     summary: Get tenant participation status (step 5)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tenant participation status payload
 *       400:
 *         description: Program explanation step not completed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Tenant only
 */
router.get(
  '/onboarding/tenant/participation-status',
  passport.authenticate('jwt', { session: false }),
  getTenantParticipationStatusHandler
);

/**
 * @openapi
 * /api/onboarding/tenant/participation-status:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Mark tenant participation status as reviewed (step 5)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Participation status confirmed
 *       400:
 *         description: Program explanation step not completed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Tenant only
 */
router.post(
  '/onboarding/tenant/participation-status',
  passport.authenticate('jwt', { session: false }),
  validateRequest(tenantParticipationStatusSchema),
  saveTenantParticipationStatusHandler
);

/**
 * @openapi
 * /api/onboarding/tenant/dashboard-walkthrough:
 *   get:
 *     tags:
 *       - Onboarding
 *     summary: Get tenant dashboard walkthrough (step 6)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tenant dashboard walkthrough payload
 *       400:
 *         description: Participation status step not completed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Tenant only
 */
router.get(
  '/onboarding/tenant/dashboard-walkthrough',
  passport.authenticate('jwt', { session: false }),
  getTenantDashboardWalkthroughHandler
);

/**
 * @openapi
 * /api/onboarding/tenant/dashboard-walkthrough:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Complete tenant dashboard walkthrough and finish onboarding (step 6)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - confirmedAccurateAndNoOwnershipRights
 *             properties:
 *               confirmedAccurateAndNoOwnershipRights:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Tenant onboarding completed
 *       400:
 *         description: Validation error or participation status step missing
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Tenant only
 */
router.post(
  '/onboarding/tenant/dashboard-walkthrough',
  passport.authenticate('jwt', { session: false }),
  validateRequest(tenantDashboardWalkthroughSchema),
  saveTenantDashboardWalkthroughHandler
);

/**
 * @openapi
 * /api/onboarding/landlord/property-details:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Landlord onboarding step 2 (Save Property Details)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - propertyType
 *               - yearBuilt
 *               - totalUnits
 *               - country
 *               - stateOrProvince
 *               - city
 *               - address
 *               - zipCode
 *               - estimatedPropertyValue
 *             properties:
 *               propertyType: { type: string }
 *               yearBuilt: { type: integer }
 *               totalUnits: { type: integer }
 *               sqFootage: { type: integer }
 *               country: { type: string }
 *               stateOrProvince: { type: string }
 *               city: { type: string }
 *               address: { type: string }
 *               zipCode: { type: string }
 *               estimatedPropertyValue: { type: number }
 *     responses:
 *       200:
 *         description: Property details saved
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Landlord only
 */
router.post(
  '/onboarding/landlord/property-details',
  passport.authenticate('jwt', { session: false }),
  validateRequest(landlordPropertyDetailsSchema),
  saveLandlordPropertyDetailsHandler
);

/**
 * @openapi
 * /api/onboarding/landlord/property-details:
 *   get:
 *     tags:
 *       - Onboarding
 *     summary: Get saved landlord property details (step 2)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Saved property details payload
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Landlord only
 */
router.get(
  '/onboarding/landlord/property-details',
  passport.authenticate('jwt', { session: false }),
  getLandlordPropertyDetailsHandler
);

/**
 * @openapi
 * /api/onboarding/landlord/program-selection:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Landlord onboarding step 3 (Save Program Selection)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - programSelection
 *               - applyToAllUnits
 *             properties:
 *               programSelection:
 *                 type: string
 *                 enum: [RPA_ONLY, TEPA_ONLY, RPA_TEPA]
 *               applyToAllUnits:
 *                 type: boolean
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Program selection saved
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Landlord only
 */
router.post(
  '/onboarding/landlord/program-selection',
  passport.authenticate('jwt', { session: false }),
  validateRequest(landlordProgramSelectionSchema),
  saveLandlordProgramSelectionHandler
);

/**
 * @openapi
 * /api/onboarding/landlord/program-selection:
 *   get:
 *     tags:
 *       - Onboarding
 *     summary: Get saved landlord program selection (step 3)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Saved program selection payload
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Landlord only
 */
router.get(
  '/onboarding/landlord/program-selection',
  passport.authenticate('jwt', { session: false }),
  getLandlordProgramSelectionHandler
);

/**
 * @openapi
 * /api/onboarding/landlord/compliance-documents:
 *   get:
 *     tags:
 *       - Onboarding
 *     summary: Get landlord compliance profile and step 4 data
 *     description: >
 *       Returns step 4 mode based on step 3 program selection.
 *       - `RPA_ONLY` -> `RPA_LIGHT`
 *       - `TEPA_ONLY` or `RPA_TEPA` -> `FULL_DOCUMENT_VERIFICATION`
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Compliance profile and saved data
 *       400:
 *         description: Program selection not completed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Landlord only
 */
router.get(
  '/onboarding/landlord/compliance-documents',
  passport.authenticate('jwt', { session: false }),
  getLandlordComplianceDocumentsHandler
);

/**
 * @openapi
 * /api/onboarding/landlord/compliance-documents:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Save landlord compliance/documents (step 4)
 *     description: >
 *       Accepts draft or full payload. Completion is evaluated based on profile from step 3 program selection.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ownerDeed: { type: object }
 *               mortgage: { type: object }
 *               insurance: { type: object }
 *               rpaCompliance: { type: object }
 *               notes: { type: string }
 *     responses:
 *       200:
 *         description: Compliance/documents saved
 *       400:
 *         description: Validation error or program selection missing
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Landlord only
 */
router.post(
  '/onboarding/landlord/compliance-documents',
  passport.authenticate('jwt', { session: false }),
  validateRequest(landlordComplianceDocumentsSchema),
  saveLandlordComplianceDocumentsHandler
);

/**
 * @openapi
 * /api/onboarding/landlord/program-economics-rules:
 *   get:
 *     tags:
 *       - Onboarding
 *     summary: Get saved landlord program economics and rules (step 5)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Saved program economics and rules payload
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Landlord only
 */
router.get(
  '/onboarding/landlord/program-economics-rules',
  passport.authenticate('jwt', { session: false }),
  getLandlordProgramEconomicsRulesHandler
);

/**
 * @openapi
 * /api/onboarding/landlord/program-economics-rules:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Save landlord program economics and rules (step 5)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tenantEconomicParticipationPool
 *               - eligibleBehaviors
 *               - participationPace
 *               - landlordBuybackOption
 *               - thirdPartyInvestorRules
 *               - tenantRentIncreaseCap
 *             properties:
 *               tenantEconomicParticipationPool:
 *                 type: number
 *                 minimum: 0.01
 *                 maximum: 100
 *               eligibleBehaviors:
 *                 type: object
 *                 required:
 *                   - onTimeRentPayment
 *                   - lengthOfTenancy
 *                   - leaseRenewal
 *                   - goodStandingNoViolations
 *                 properties:
 *                   onTimeRentPayment: { type: boolean, example: true }
 *                   lengthOfTenancy: { type: boolean, example: true }
 *                   leaseRenewal: { type: boolean, example: false }
 *                   goodStandingNoViolations: { type: boolean, example: false }
 *               participationPace:
 *                 type: string
 *                 enum: [SLOW, STANDARD, ACCELERATED]
 *               landlordBuybackOption:
 *                 type: string
 *                 enum: [FAIR_VALUE, DISCOUNTED_VALUE, NOT_ALLOWED]
 *               thirdPartyInvestorRules:
 *                 type: string
 *                 enum:
 *                   - NOT_TRANSFERABLE
 *                   - TRANSFERABLE_ONLY_ON_PROPERTY_SALE
 *                   - TRANSFERABLE_WITH_LANDLORD_APPROVAL
 *               tenantRentIncreaseCap:
 *                 type: string
 *                 enum:
 *                   - STANDARD_MARKET_INCREASES
 *                   - CAPPED_INCREASES_FOR_LONG_TERM_TENANTS
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Program economics and rules saved
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Landlord only
 */
router.post(
  '/onboarding/landlord/program-economics-rules',
  passport.authenticate('jwt', { session: false }),
  validateRequest(landlordProgramEconomicsRulesSchema),
  saveLandlordProgramEconomicsRulesHandler
);

/**
 * @openapi
 * /api/onboarding/landlord/framework-acknowledgement:
 *   get:
 *     tags:
 *       - Onboarding
 *     summary: Get saved landlord framework acknowledgement (step 6)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Saved framework acknowledgement payload
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Landlord only
 */
router.get(
  '/onboarding/landlord/framework-acknowledgement',
  passport.authenticate('jwt', { session: false }),
  getLandlordFrameworkAcknowledgementHandler
);

router.get(
  '/onboarding/landlord/framework-acknowledgment',
  passport.authenticate('jwt', { session: false }),
  getLandlordFrameworkAcknowledgementHandler
);

/**
 * @openapi
 * /api/onboarding/landlord/framework-acknowledgement:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Save landlord framework acknowledgement (step 6)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               noOwnershipTransferAcknowledged:
 *                 type: boolean
 *                 example: true
 *               understandsNoOwnershipTransfer:
 *                 type: boolean
 *                 example: true
 *               ownershipRightsAcknowledged:
 *                 type: boolean
 *                 example: true
 *               acknowledgement:
 *                 type: boolean
 *                 example: true
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Framework acknowledgement saved
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Landlord only
 */
router.post(
  '/onboarding/landlord/framework-acknowledgement',
  passport.authenticate('jwt', { session: false }),
  validateRequest(landlordFrameworkAcknowledgementSchema),
  saveLandlordFrameworkAcknowledgementHandler
);

router.post(
  '/onboarding/landlord/framework-acknowledgment',
  passport.authenticate('jwt', { session: false }),
  validateRequest(landlordFrameworkAcknowledgementSchema),
  saveLandlordFrameworkAcknowledgementHandler
);

/**
 * @openapi
 * /api/onboarding/landlord/compliance-acknowledgements:
 *   get:
 *     tags:
 *       - Onboarding
 *     summary: Get saved landlord compliance acknowledgements (step 7)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Saved compliance acknowledgements payload
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Landlord only
 */
router.get(
  '/onboarding/landlord/compliance-acknowledgements',
  passport.authenticate('jwt', { session: false }),
  getLandlordComplianceAcknowledgementsHandler
);

router.get(
  '/onboarding/landlord/compliance-acknowledgments',
  passport.authenticate('jwt', { session: false }),
  getLandlordComplianceAcknowledgementsHandler
);

/**
 * @openapi
 * /api/onboarding/landlord/compliance-acknowledgements:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Save landlord compliance acknowledgements (step 7)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rewardsParticipationAgreementAndTenantProtections:
 *                 type: boolean
 *               tepaOptionalAndProgramRules:
 *                 type: boolean
 *               aggregateDataAnonymizedNoPii:
 *                 type: boolean
 *               exitAndOptOutProceduresReviewed:
 *                 type: boolean
 *               agreeAndContinue:
 *                 type: boolean
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Compliance acknowledgements saved
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Landlord only
 */
router.post(
  '/onboarding/landlord/compliance-acknowledgements',
  passport.authenticate('jwt', { session: false }),
  validateRequest(landlordComplianceAcknowledgementsSchema),
  saveLandlordComplianceAcknowledgementsHandler
);

router.post(
  '/onboarding/landlord/compliance-acknowledgments',
  passport.authenticate('jwt', { session: false }),
  validateRequest(landlordComplianceAcknowledgementsSchema),
  saveLandlordComplianceAcknowledgementsHandler
);

/**
 * @openapi
 * /api/onboarding/landlord/review-activate:
 *   get:
 *     tags:
 *       - Onboarding
 *     summary: Get landlord review and activate payload (step 8)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Review summary and activation readiness
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Landlord only
 */
router.get(
  '/onboarding/landlord/review-activate',
  passport.authenticate('jwt', { session: false }),
  getLandlordReviewActivateHandler
);

router.get(
  '/onboarding/landlord/review-and-activate',
  passport.authenticate('jwt', { session: false }),
  getLandlordReviewActivateHandler
);

/**
 * @openapi
 * /api/onboarding/landlord/review-activate:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Activate landlord program after final review (step 8)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               certificationAccepted:
 *                 type: boolean
 *               certifyAndActivate:
 *                 type: boolean
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Program activated
 *       400:
 *         description: Validation error or prerequisites missing
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Landlord only
 */
router.post(
  '/onboarding/landlord/review-activate',
  passport.authenticate('jwt', { session: false }),
  validateRequest(landlordReviewActivateSchema),
  saveLandlordReviewActivateHandler
);

router.post(
  '/onboarding/landlord/review-and-activate',
  passport.authenticate('jwt', { session: false }),
  validateRequest(landlordReviewActivateSchema),
  saveLandlordReviewActivateHandler
);

router.post(
  '/onboarding/landlord/activate-program',
  passport.authenticate('jwt', { session: false }),
  validateRequest(landlordReviewActivateSchema),
  saveLandlordReviewActivateHandler
);

/**
 * @openapi
 * /api/onboarding/admin/community/interests:
 *   get:
 *     tags:
 *       - Admin
 *     summary: List community interest submissions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [SUBMITTED, INVITE_GENERATED, ONBOARDED]
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Community interests fetched
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin only
 */
router.get(
  '/onboarding/admin/community/interests',
  passport.authenticate('jwt', { session: false }),
  validateRequest(listCommunityInterestSchema),
  listCommunityInterestHandler
);

/**
 * @openapi
 * /api/onboarding/admin/community/{interestId}/generate-link:
 *   post:
 *     tags:
 *       - Admin
 *     summary: Generate community onboarding invite link
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: interestId
 *         required: true
 *         schema:
 *           type: string
 *         description: Community interest request id
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               expiresInHours:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 720
 *               frontendUrl:
 *                 type: string
 *                 format: uri
 *               assignedRole:
 *                 type: string
 *                 enum: [COMMUNITY, COMMUNITY_STAKEHOLDER]
 *     responses:
 *       200:
 *         description: Invite link generated
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin only
 *       404:
 *         description: Interest request not found
 */
router.post(
  '/onboarding/admin/community/:interestId/generate-link',
  passport.authenticate('jwt', { session: false }),
  validateRequest(generateCommunityInviteLinkSchema),
  generateCommunityInviteLinkHandler
);

/**
 * @openapi
 * /api/onboarding/admin/investor/interests:
 *   get:
 *     tags:
 *       - Admin
 *     summary: List investor interest submissions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [SUBMITTED, INVITE_GENERATED, ONBOARDED]
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Investor interests fetched
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin only
 */
router.get(
  '/onboarding/admin/investor/interests',
  passport.authenticate('jwt', { session: false }),
  validateRequest(listInvestorInterestSchema),
  listInvestorInterestHandler
);

/**
 * @openapi
 * /api/onboarding/admin/investor/{interestId}/generate-link:
 *   post:
 *     tags:
 *       - Admin
 *     summary: Generate investor onboarding invite link
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: interestId
 *         required: true
 *         schema:
 *           type: string
 *         description: Investor interest request id
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               expiresInHours:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 720
 *               frontendUrl:
 *                 type: string
 *                 format: uri
 *     responses:
 *       200:
 *         description: Invite link generated
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin only
 *       404:
 *         description: Interest request not found
 */
router.post(
  '/onboarding/admin/investor/:interestId/generate-link',
  passport.authenticate('jwt', { session: false }),
  validateRequest(generateInvestorInviteLinkSchema),
  generateInvestorInviteLinkHandler
);

/**
 * @openapi
 * /api/onboarding/landlord/tenant/interests:
 *   get:
 *     tags:
 *       - Onboarding
 *     summary: List tenant interest submissions (Landlord or Admin)
 *     description: Returns all submitted tenant interest forms. Landlords use this to find tenants to invite.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [SUBMITTED, INVITE_GENERATED, ONBOARDED]
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Tenant interests fetched
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Landlord or admin only
 */
router.get(
  '/onboarding/landlord/tenant/interests',
  passport.authenticate('jwt', { session: false }),
  validateRequest(listTenantInterestSchema),
  listTenantInterestHandler
);

/**
 * @openapi
 * /api/onboarding/landlord/tenant/{interestId}/generate-link:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Generate tenant onboarding invite link (Landlord or Admin)
 *     description: The landlord sends the invite link directly to the tenant after reviewing their interest submission.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: interestId
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant interest request id
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               expiresInHours:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 720
 *               frontendUrl:
 *                 type: string
 *                 format: uri
 *     responses:
 *       200:
 *         description: Invite link generated and emailed to tenant
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Landlord or admin only
 *       404:
 *         description: Interest request not found
 *       409:
 *         description: Tenant already onboarded
 */
router.post(
  '/onboarding/landlord/tenant/:interestId/generate-link',
  passport.authenticate('jwt', { session: false }),
  validateRequest(generateTenantInviteLinkSchema),
  generateTenantInviteLinkHandler
);

/**
 * @openapi
 * /api/onboarding/admin/tenant/interests:
 *   get:
 *     tags:
 *       - Admin
 *     summary: List tenant interest submissions (Admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [SUBMITTED, INVITE_GENERATED, ONBOARDED]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Tenant interests fetched
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Landlord or admin only
 */
router.get(
  '/onboarding/admin/tenant/interests',
  passport.authenticate('jwt', { session: false }),
  validateRequest(listTenantInterestSchema),
  listTenantInterestHandler
);

/**
 * @openapi
 * /api/onboarding/admin/tenant/{interestId}/generate-link:
 *   post:
 *     tags:
 *       - Admin
 *     summary: Generate tenant onboarding invite link (Admin fallback)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: interestId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               expiresInHours:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 720
 *               frontendUrl:
 *                 type: string
 *                 format: uri
 *     responses:
 *       200:
 *         description: Invite link generated
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Landlord or admin only
 *       404:
 *         description: Interest request not found
 */
router.post(
  '/onboarding/admin/tenant/:interestId/generate-link',
  passport.authenticate('jwt', { session: false }),
  validateRequest(generateTenantInviteLinkSchema),
  generateTenantInviteLinkHandler
);

/**
 * @openapi
 * /api/onboarding/admin/landlord/interests:
 *   get:
 *     tags:
 *       - Admin
 *     summary: List landlord interest submissions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [SUBMITTED, INVITE_GENERATED, ONBOARDED]
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Landlord interests fetched
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       403:
 *         description: Admin only
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get(
  '/onboarding/admin/landlord/interests',
  passport.authenticate('jwt', { session: false }),
  validateRequest(listLandlordInterestSchema),
  listLandlordInterestHandler
);

/**
 * @openapi
 * /api/onboarding/admin/landlord/{interestId}/generate-link:
 *   post:
 *     tags:
 *       - Admin
 *     summary: Generate landlord onboarding invite link
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: interestId
 *         required: true
 *         schema:
 *           type: string
 *         description: Landlord interest request id
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               expiresInHours:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 720
 *               frontendUrl:
 *                 type: string
 *                 format: uri
 *     responses:
 *       200:
 *         description: Invite link generated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       403:
 *         description: Admin only
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       404:
 *         description: Interest request not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.post(
  '/onboarding/admin/landlord/:interestId/generate-link',
  passport.authenticate('jwt', { session: false }),
  validateRequest(generateLandlordInviteLinkSchema),
  generateLandlordInviteLinkHandler
);
import { evaluateRiskBadgesSchema } from '../validators/riskBadge.validators';
import {
  upsertExtractionFieldsSchema,
  recordOverrideSchema,
  confirmFieldsSchema,
  getFieldsQuerySchema,
  getUnconfirmedQuerySchema,
} from '../validators/extractionConfirmation.validators';


/**
 * @openapi
 * /api/onboarding/status:
 *   get:
 *     tags:
 *       - Onboarding
 *     summary: Get onboarding readiness
 *     description: >
 *       Returns onboarding steps, status, and readiness
 *       for the authenticated user.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Onboarding status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OnboardingStatusResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get(
  '/onboarding/status',
  authMiddleware,
  getOnboardingStatus
);

/**
 * @openapi
 * /api/onboarding/submit-step:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Submit onboarding step payload
 *     description: >
 *       Submits data for a role-specific onboarding step.
 *       For tenant TEPA step, use `/api/tenant/programs/tepa/opt-in` instead.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OnboardingSubmitStepRequest'
 *     responses:
 *       200:
 *         description: Onboarding step submitted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OnboardingSubmitStepResponse'
 *       400:
 *         description: Invalid payload or invalid step for current role
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.post(
  '/onboarding/submit-step',
  authMiddleware,
  validateRequest(submitOnboardingStepSchema),
  submitOnboardingStepHandler
);

/**
 * @openapi
 * /api/onboarding/upload-doc:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Upload onboarding document to S3
 *     description: >
 *       Accepts a multipart file upload (field "file") plus stepKey and documentType fields.
 *       Stores the file in S3 and records the document against the user's onboarding state.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, stepKey, documentType]
 *             properties:
 *               file: { type: string, format: binary }
 *               stepKey: { type: string }
 *               documentType: { type: string }
 *     responses:
 *       201:
 *         description: Onboarding document recorded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OnboardingUploadDocResponse'
 *       400:
 *         description: Invalid payload
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.post(
  '/onboarding/upload-doc',
  authMiddleware,
  uploadSingle,
  uploadOnboardingDocumentHandler
);

/**
 * @openapi
 * /api/onboarding/verify-doc:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Verify or reject onboarding document
 *     description: Admin-only endpoint used to approve or reject uploaded onboarding docs.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OnboardingVerifyDocRequest'
 *     responses:
 *       200:
 *         description: Document verification status updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OnboardingVerifyDocResponse'
 *       400:
 *         description: Invalid payload
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       403:
 *         description: Forbidden (admin only)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.post(
  '/onboarding/verify-doc',
  authMiddleware,
  validateRequest(verifyOnboardingDocumentSchema),
  verifyOnboardingDocumentHandler
);

/**
 * @openapi
 * /api/onboarding/risk-badges/evaluate:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Evaluate risk badges for onboarding cards (ONB-005)
 *     description: >
 *       Returns per-card risk badge (RED/YELLOW/GREEN) and a global badge.
 *       RED: Insurance expired, Notice of default Yes, Mortgage > property value, Ownership % mismatch.
 *       YELLOW: Missing required fields.
 *       GREEN: Complete and valid.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cards]
 *             properties:
 *               cards:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [id]
 *                   properties:
 *                     id: { type: string }
 *                     insuranceExpiryDate: { type: string, format: date-time, nullable: true }
 *                     noticeOfDefault: { type: boolean, nullable: true }
 *                     mortgageAmount: { type: number, minimum: 0, nullable: true }
 *                     propertyValue: { type: number, minimum: 0, nullable: true }
 *                     ownershipPct: { type: number, minimum: 0, maximum: 100, nullable: true }
 *                     expectedOwnershipPct: { type: number, minimum: 0, maximum: 100, nullable: true }
 *               requiredFieldKeys:
 *                 type: array
 *                 items: { type: string }
 *                 description: Optional list of field keys required for GREEN (defaults to all card fields except id)
 *     responses:
 *       200:
 *         description: Per-card and global risk badges
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     cards:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           cardId: { type: string }
 *                           badge: { type: string, enum: [RED, YELLOW, GREEN] }
 *                           reasons: { type: array, items: { type: string } }
 *                     globalBadge: { type: string, enum: [RED, YELLOW, GREEN] }
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/onboarding/risk-badges/evaluate',
  passport.authenticate('jwt', { session: false }),
  validateRequest(evaluateRiskBadgesSchema),
  evaluateRiskBadgesHandler
);

/**
 * @openapi
 * /api/onboarding/extraction/fields:
 *   post:
 *     tags: [Onboarding]
 *     summary: Upsert AI-extracted or manual fields (ONB-007)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [scope, fields]
 *             properties:
 *               scope: { type: string, example: "document:doc123" }
 *               fields:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [fieldKey, value, source]
 *                   properties:
 *                     fieldKey: { type: string }
 *                     value: {}
 *                     source: { type: string, enum: [ai, manual] }
 *                     confidence: { type: number, minimum: 0, maximum: 1 }
 *                     lineage: { type: object, properties: { extractionId: {}, model: {}, documentId: {}, extractedAt: {} } }
 *     responses:
 *       200: { description: Fields saved }
 *       401: { description: Unauthorized }
 */
router.post(
  '/onboarding/extraction/fields',
  passport.authenticate('jwt', { session: false }),
  validateRequest(upsertExtractionFieldsSchema),
  upsertExtractionFieldsHandler
);

/**
 * @openapi
 * /api/onboarding/extraction/override:
 *   post:
 *     tags: [Onboarding]
 *     summary: Record manual override (ONB-007)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [scope, fieldKey, value]
 *             properties:
 *               scope: { type: string }
 *               fieldKey: { type: string }
 *               value: {}
 *     responses:
 *       200: { description: Override recorded }
 *       401: { description: Unauthorized }
 */
router.post(
  '/onboarding/extraction/override',
  passport.authenticate('jwt', { session: false }),
  validateRequest(recordOverrideSchema),
  recordOverrideHandler
);

/**
 * @openapi
 * /api/onboarding/extraction/confirm:
 *   post:
 *     tags: [Onboarding]
 *     summary: Confirm AI-extracted fields (ONB-007)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [scope, fieldKeys]
 *             properties:
 *               scope: { type: string }
 *               fieldKeys: { type: array, items: { type: string } }
 *     responses:
 *       200: { description: Fields confirmed }
 *       401: { description: Unauthorized }
 */
router.post(
  '/onboarding/extraction/confirm',
  passport.authenticate('jwt', { session: false }),
  validateRequest(confirmFieldsSchema),
  confirmFieldsHandler
);

/**
 * @openapi
 * /api/onboarding/extraction/fields:
 *   get:
 *     tags: [Onboarding]
 *     summary: Get extraction fields for scope (ONB-007)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: scope
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: fields array and unconfirmedCount }
 *       401: { description: Unauthorized }
 */
router.get(
  '/onboarding/extraction/fields',
  passport.authenticate('jwt', { session: false }),
  validateRequest(getFieldsQuerySchema),
  getFieldsHandler
);

/**
 * @openapi
 * /api/onboarding/extraction/unconfirmed:
 *   get:
 *     tags: [Onboarding]
 *     summary: Get unconfirmed AI fields (ONB-007)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: scope
 *         schema: { type: string }
 *     responses:
 *       200: { description: fields array and count }
 *       401: { description: Unauthorized }
 */
router.get(
  '/onboarding/extraction/unconfirmed',
  passport.authenticate('jwt', { session: false }),
  validateRequest(getUnconfirmedQuerySchema),
  getUnconfirmedHandler
);

router.post(
  '/onboarding/admin/:type/:interestId/reject',
  passport.authenticate('jwt', { session: false }),
  rejectInterestHandler
);

export default router;
