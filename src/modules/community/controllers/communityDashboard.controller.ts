import { Response } from 'express';
import { AppError } from '../../../core/errors/AppError';
import { errorResponse, successResponse } from '../../../core/utils/response';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import {
  getCommunityAuditTrail,
  getCommunityCompliance,
  getCommunityComplianceIssues,
  getCommunityDashboardProfile,
  getCommunityEconomicImpact,
  getCommunityFiscalImpact,
  getCommunityGetHelp,
  getCommunityHousingProjects,
  getCommunityMessages,
  getCommunityMessagesAudit,
  getCommunityOverview,
  getCommunityPrograms,
  getCommunityProjectMetrics,
  getCommunityPublicCommitments,
  getCommunityReports,
  getCommunityStakeholderTypeConfig,
  getCommunityTenantParticipation,
} from '../services/communityDashboard.service';

function requireUserId(req: AuthenticatedRequest, res: Response) {
  if (!req.auth?._id) {
    errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return null;
  }
  return req.auth._id;
}

async function handleDashboardRequest(
  req: AuthenticatedRequest,
  res: Response,
  handler: (userId: NonNullable<AuthenticatedRequest['auth']>['_id']) => Promise<unknown>
): Promise<void> {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const result = await handler(userId);
    successResponse(res, result);
  } catch (err) {
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'COMMUNITY_DASHBOARD_ERROR', err.message);
      return;
    }
    errorResponse(res, 500, 'COMMUNITY_DASHBOARD_ERROR', 'Failed to load community dashboard data');
  }
}

export async function getCommunityDashboardProfileHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await handleDashboardRequest(req, res, getCommunityDashboardProfile);
}

export async function getCommunityStakeholderTypeConfigHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await handleDashboardRequest(req, res, getCommunityStakeholderTypeConfig);
}

export async function getCommunityOverviewHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await handleDashboardRequest(req, res, getCommunityOverview);
}

export async function getCommunityProgramsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await handleDashboardRequest(req, res, getCommunityPrograms);
}

export async function getCommunityProjectMetricsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await handleDashboardRequest(req, res, getCommunityProjectMetrics);
}

export async function getCommunityHousingProjectsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await handleDashboardRequest(req, res, getCommunityHousingProjects);
}

export async function getCommunityFiscalImpactHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await handleDashboardRequest(req, res, getCommunityFiscalImpact);
}

export async function getCommunityEconomicImpactHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await handleDashboardRequest(req, res, getCommunityEconomicImpact);
}

export async function getCommunityTenantParticipationHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await handleDashboardRequest(req, res, getCommunityTenantParticipation);
}

export async function getCommunityComplianceHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await handleDashboardRequest(req, res, getCommunityCompliance);
}

export async function getCommunityPublicCommitmentsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await handleDashboardRequest(req, res, getCommunityPublicCommitments);
}

export async function getCommunityComplianceIssuesHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await handleDashboardRequest(req, res, getCommunityComplianceIssues);
}

export async function getCommunityReportsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await handleDashboardRequest(req, res, getCommunityReports);
}

export async function getCommunityMessagesAuditHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await handleDashboardRequest(req, res, getCommunityMessagesAudit);
}

export async function getCommunityMessagesHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await handleDashboardRequest(req, res, getCommunityMessages);
}

export async function getCommunityAuditTrailHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await handleDashboardRequest(req, res, getCommunityAuditTrail);
}

export async function getCommunityGetHelpHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await handleDashboardRequest(req, res, getCommunityGetHelp);
}
