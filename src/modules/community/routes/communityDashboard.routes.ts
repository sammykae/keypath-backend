import { Router } from 'express';
import { authMiddleware } from '../../../middleware/authMiddleware';
import { requireRole } from '../../../middleware/rbac.middleware';
import {
  getCommunityAuditTrailHandler,
  getCommunityComplianceHandler,
  getCommunityComplianceIssuesHandler,
  getCommunityDashboardProfileHandler,
  getCommunityEconomicImpactHandler,
  getCommunityFiscalImpactHandler,
  getCommunityGetHelpHandler,
  getCommunityHousingProjectsHandler,
  getCommunityMessagesAuditHandler,
  getCommunityMessagesHandler,
  getCommunityOverviewHandler,
  getCommunityProgramsHandler,
  getCommunityProjectMetricsHandler,
  getCommunityPublicCommitmentsHandler,
  getCommunityReportsHandler,
  getCommunityStakeholderTypeConfigHandler,
  getCommunityTenantParticipationHandler,
} from '../controllers/communityDashboard.controller';
import {
  flagCommunityComplianceIssueHandler,
  getCommunityAiInsightsHandler,
  recordCommunityActionHandler,
  sendCommunityMessageHandler,
} from '../controllers/communityDashboardActions.controller';

const router = Router();

router.use(authMiddleware);
router.use(requireRole(['community_stakeholder', 'admin']));

router.get('/profile', getCommunityDashboardProfileHandler);
router.get('/stakeholder-type-config', getCommunityStakeholderTypeConfigHandler);
router.get('/overview', getCommunityOverviewHandler);
router.get('/programs', getCommunityProgramsHandler);
router.get('/project-metrics', getCommunityProjectMetricsHandler);
router.get('/projects', getCommunityHousingProjectsHandler);
router.get('/fiscal-impact', getCommunityFiscalImpactHandler);
router.get('/economic-impact', getCommunityEconomicImpactHandler);
router.get('/tenant-participation', getCommunityTenantParticipationHandler);
router.get('/compliance', getCommunityComplianceHandler);
router.get('/commitments', getCommunityPublicCommitmentsHandler);
router.get('/compliance-issues', getCommunityComplianceIssuesHandler);
router.get('/reports', getCommunityReportsHandler);
router.get('/messages-audit', getCommunityMessagesAuditHandler);
router.get('/messages', getCommunityMessagesHandler);
router.get('/audit-trail', getCommunityAuditTrailHandler);
router.get('/get-help', getCommunityGetHelpHandler);
router.get('/ai-insights', getCommunityAiInsightsHandler);
router.post('/actions', recordCommunityActionHandler);
router.post('/actions/flag-compliance', flagCommunityComplianceIssueHandler);
router.post('/actions/send-message', sendCommunityMessageHandler);

export default router;
