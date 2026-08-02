import { Response } from 'express';
import { AppError } from '../../../core/errors/AppError';
import { errorResponse, successResponse } from '../../../core/utils/response';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import {
  flagCommunityComplianceIssue,
  getCommunityAiInsights,
  recordCommunityDashboardAction,
  sendCommunityStakeholderMessage,
} from '../services/communityDashboardActions.service';

function requireUserId(req: AuthenticatedRequest, res: Response) {
  if (!req.auth?._id) {
    errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return null;
  }
  return req.auth._id;
}

async function handleAction(
  req: AuthenticatedRequest,
  res: Response,
  handler: (userId: NonNullable<AuthenticatedRequest['auth']>['_id']) => Promise<unknown>
) {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const result = await handler(userId);
    successResponse(res, result);
  } catch (err) {
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'COMMUNITY_ACTION_ERROR', err.message);
      return;
    }
    errorResponse(res, 500, 'COMMUNITY_ACTION_ERROR', 'Failed to process community dashboard action');
  }
}

export async function recordCommunityActionHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await handleAction(req, res, async (userId) => {
    const { actionType, detail, actor, metadata } = req.body ?? {};
    if (!actionType || !detail) {
      throw new AppError('actionType and detail are required', 400);
    }
    return recordCommunityDashboardAction(userId, {
      actionType,
      detail: String(detail),
      actor: typeof actor === 'string' ? actor : undefined,
      metadata: metadata && typeof metadata === 'object' ? metadata : undefined,
    });
  });
}

export async function getCommunityAiInsightsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await handleAction(req, res, getCommunityAiInsights);
}

export async function flagCommunityComplianceIssueHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await handleAction(req, res, async (userId) => {
    const { label, detail, severity } = req.body ?? {};
    if (!label) {
      throw new AppError('label is required', 400);
    }
    return flagCommunityComplianceIssue(userId, {
      label: String(label),
      detail: typeof detail === 'string' ? detail : undefined,
      severity: typeof severity === 'string' ? severity : undefined,
    });
  });
}

export async function sendCommunityMessageHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  await handleAction(req, res, async (userId) => {
    const { subject, body, to } = req.body ?? {};
    if (!subject || !body) {
      throw new AppError('subject and body are required', 400);
    }
    return sendCommunityStakeholderMessage(userId, {
      subject: String(subject),
      body: String(body),
      to: typeof to === 'string' ? to : undefined,
    });
  });
}
