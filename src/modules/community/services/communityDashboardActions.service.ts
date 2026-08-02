import { Types } from 'mongoose';
import { resolveCommunityDashboardScope } from './communityScope.service';
import { getCommunityDashboardSeed } from '../data/communityDashboardSeedData';
import type { CommunityAuditTrailEvent } from '../data/communityDashboardSeedData';

type CommunityActionType =
  | 'EXPORT_DASHBOARD_REPORT'
  | 'EXPORT_PROJECT_SUMMARY'
  | 'DOWNLOAD_PDF'
  | 'EXPORT_CSV'
  | 'GENERATE_BRIEF'
  | 'FLAG_COMPLIANCE_ISSUE'
  | 'VIEW_PROJECT_DETAILS'
  | 'VIEW_COMMITMENT_DETAILS'
  | 'VIEW_AUDIT_EVENT'
  | 'SEND_MESSAGE'
  | 'AI_INSIGHTS_OPENED';

type RecordedAuditEvent = CommunityAuditTrailEvent & {
  stakeholderUserId: string;
};

/** In-memory audit events until live persistence is wired */
const runtimeAuditEvents = new Map<string, RecordedAuditEvent[]>();

function userKey(userId: Types.ObjectId) {
  return String(userId);
}

function makeEventId() {
  return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function recordCommunityDashboardAction(
  userId: Types.ObjectId,
  input: {
    actionType: CommunityActionType;
    detail: string;
    actor?: string;
    metadata?: Record<string, unknown>;
  }
) {
  const scope = await resolveCommunityDashboardScope(userId);
  const actionLabels: Record<CommunityActionType, string> = {
    EXPORT_DASHBOARD_REPORT: 'Dashboard report exported',
    EXPORT_PROJECT_SUMMARY: 'Public project summary exported',
    DOWNLOAD_PDF: 'PDF report downloaded',
    EXPORT_CSV: 'CSV report exported',
    GENERATE_BRIEF: 'Brief generated',
    FLAG_COMPLIANCE_ISSUE: 'Compliance issue flagged',
    VIEW_PROJECT_DETAILS: 'Project details viewed',
    VIEW_COMMITMENT_DETAILS: 'Commitment details viewed',
    VIEW_AUDIT_EVENT: 'Audit trail event viewed',
    SEND_MESSAGE: 'Stakeholder message sent',
    AI_INSIGHTS_OPENED: 'KeyPath AI Insights opened',
  };

  const event: RecordedAuditEvent = {
    id: makeEventId(),
    timestamp: new Date().toISOString(),
    actor: input.actor ?? scope.organizationName ?? scope.stakeholderTypeLabel,
    action: actionLabels[input.actionType],
    detail: input.detail,
    stakeholderUserId: userKey(userId),
  };

  const existing = runtimeAuditEvents.get(userKey(userId)) ?? [];
  runtimeAuditEvents.set(userKey(userId), [event, ...existing]);

  return {
    event: {
      id: event.id,
      timestamp: event.timestamp,
      actor: event.actor,
      action: event.action,
      detail: event.detail,
    },
    actionType: input.actionType,
    metadata: input.metadata ?? null,
    scope: {
      configKey: scope.configKey,
      stakeholderType: scope.stakeholderType,
      organizationName: scope.organizationName ?? null,
    },
  };
}

export async function getCommunityMessagesAuditWithRuntime(
  userId: Types.ObjectId
) {
  const scope = await resolveCommunityDashboardScope(userId);
  const seed = getCommunityDashboardSeed(scope.configKey);
  const runtime = runtimeAuditEvents.get(userKey(userId)) ?? [];

  return {
    messages: seed.messages,
    auditTrail: [
      ...runtime.map(({ id, timestamp, actor, action, detail }) => ({
        id,
        timestamp,
        actor,
        action,
        detail,
      })),
      ...seed.auditTrail,
    ],
  };
}

export async function getCommunityAiInsights(userId: Types.ObjectId) {
  const scope = await resolveCommunityDashboardScope(userId);
  const seed = getCommunityDashboardSeed(scope.configKey);
  const config = seed.programs;

  return {
    title: 'KeyPath AI Insights',
    status: 'ready' as const,
    summary:
      'AI-assisted oversight insights for your monitored portfolio. Recommendations are advisory and based on current program indicators.',
    insights: [
      {
        title: 'Portfolio health',
        detail: `${config.kpiCards[0]?.title ?? 'Primary metric'} is ${config.kpiCards[0]?.value ?? 'stable'} relative to recent reporting periods.`,
      },
      {
        title: 'Commitment watch',
        detail:
          'Review any At Risk commitments this week and confirm corrective actions with program partners.',
      },
      {
        title: 'Reporting readiness',
        detail:
          'Public report packages are available for download. Generate a brief before your next stakeholder meeting.',
      },
    ],
    stakeholderType: scope.stakeholderType,
    organizationName: scope.organizationName ?? null,
  };
}

export async function flagCommunityComplianceIssue(
  userId: Types.ObjectId,
  input: { label: string; detail?: string; severity?: string }
) {
  return recordCommunityDashboardAction(userId, {
    actionType: 'FLAG_COMPLIANCE_ISSUE',
    detail: `${input.label}${input.detail ? `: ${input.detail}` : ''}`,
    metadata: {
      label: input.label,
      severity: input.severity ?? 'medium',
      status: 'flagged',
    },
  });
}

export async function sendCommunityStakeholderMessage(
  userId: Types.ObjectId,
  input: { subject: string; body: string; to?: string }
) {
  const scope = await resolveCommunityDashboardScope(userId);
  const result = await recordCommunityDashboardAction(userId, {
    actionType: 'SEND_MESSAGE',
    detail: `Message sent: ${input.subject}`,
    metadata: {
      to: input.to ?? 'KeyPath Program Team',
      subject: input.subject,
      body: input.body,
    },
  });

  return {
    ...result,
    message: {
      id: `msg-${Date.now()}`,
      from: scope.organizationName ?? scope.stakeholderTypeLabel,
      to: input.to ?? 'KeyPath Program Team',
      subject: input.subject,
      preview: input.body.slice(0, 120),
      sentAt: new Date().toISOString(),
      unread: false,
    },
  };
}
