import mongoose from 'mongoose';
import { CampaignModel, CampaignStatus } from '../models/campaign.model';
import { AppError } from '../../../core/errors/AppError';
import type {
  CreateCampaignPayload,
  UpdateCampaignPayload,
} from '../dto/campaign.dto';
import type { CampaignTriggerEvent } from '../types/campaignTriggerEvent';
import {
  CampaignLedgerMetrics,
  getCampaignMetricsMap,
} from './campaignMetrics.service';

function statusLabel(status: CampaignStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'Active';
    case 'PAUSED':
      return 'Paused';
    case 'ENDED':
      return 'Ended';
    default:
      return status;
  }
}

function formatDurationLabel(start?: Date | null, end?: Date | null): string | null {
  if (!start || !end) return null;
  const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

const TRIGGER_EVENT_LABELS: Record<string, string> = {
  TENANCY_CREATED: 'Move-in',
  RENT_PAYMENT_PAID: 'On-time rent',
  EARLY_RENT_PAYMENT: 'Early rent payment',
  LEASE_RENEWAL: 'Lease renewal',
  MAINTENANCE_REPORTED_EARLY: 'Maintenance issue reported early',
  HVAC_FILTER_REPLACEMENT_PHOTO: 'HVAC filter replacement photo',
  MOISTURE_LEAK_CHECK_COMPLETED: 'Moisture / leak check completed',
  SAFETY_ALERT_RESPONSE: 'Safety alert response',
  SURVEY_COMPLETED: 'Survey completed',
  PAPERLESS_ENROLLMENT: 'Paperless enrollment',
  COMMUNITY_PARTICIPATION: 'Community participation',
  TENANT_REFERRAL: 'Tenant referral',
  GOOD_UNIT_CARE_VERIFICATION: 'Good unit care verification',
};

function triggerEventToBehaviors(event: string): string[] {
  return [TRIGGER_EVENT_LABELS[event] ?? event];
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function pickDocFields(raw: Record<string, unknown>) {
  const goal = raw.goal as string | undefined;
  const startsAt = raw.startsAt as Date | undefined;
  const endsAt = raw.endsAt as Date | undefined;
  const budgetUsd = raw.budgetUsd as number | undefined;
  const budgetTokenCap = raw.budgetTokenCap as number | undefined;
  const rewardType = (raw.rewardType as string | undefined) ?? 'POINTS';
  return { goal, startsAt, endsAt, budgetUsd, budgetTokenCap, rewardType };
}

function buildMetricsBlock(
  m: CampaignLedgerMetrics,
  budgetUsd?: number | null,
  budgetTokenCap?: number | null
) {
  const cap = budgetTokenCap != null && budgetTokenCap > 0 ? budgetTokenCap : null;
  const budgetUsedPercent =
    cap != null ? Math.min(100, Math.round((m.tokensIssued / cap) * 1000) / 10) : null;
  const budgetUsedUsd =
    budgetUsd != null && cap != null
      ? roundMoney((m.tokensIssued / cap) * budgetUsd)
      : null;

  return {
    participantCount: m.participantCount,
    tokensIssued: m.tokensIssued,
    budgetUsedPercent,
    budgetUsedUsd,
  };
}

/** API shape aligned with landlord rewards campaign cards */
export function toPublicCampaign(
  raw: Record<string, unknown>,
  metrics: CampaignLedgerMetrics
) {
  const id = (raw._id as mongoose.Types.ObjectId).toString();
  const { goal, startsAt, endsAt, budgetUsd, budgetTokenCap, rewardType } = pickDocFields(raw);
  const status = raw.status as CampaignStatus;
  const orgId = raw.orgId as mongoose.Types.ObjectId;
  const propertyId = raw.propertyId as mongoose.Types.ObjectId | undefined;
  const unitId = raw.unitId as mongoose.Types.ObjectId | undefined;

  const metricsBlock = buildMetricsBlock(metrics, budgetUsd ?? null, budgetTokenCap ?? null);

  const durationLabel = formatDurationLabel(startsAt ?? null, endsAt ?? null);

  return {
    id,
    orgId: orgId.toString(),
    name: raw.name as string,
    description: (raw.description as string | undefined) ?? null,
    goal: goal ?? null,
    startsAt: startsAt ? new Date(startsAt).toISOString() : null,
    endsAt: endsAt ? new Date(endsAt).toISOString() : null,
    budgetUsd: budgetUsd ?? null,
    budgetTokenCap: budgetTokenCap ?? null,
    suggestionHeadline: (raw.suggestionHeadline as string | undefined) ?? null,
    suggestionDetail: (raw.suggestionDetail as string | undefined) ?? null,
    status,
    statusLabel: statusLabel(status),
    triggerEvent: raw.triggerEvent as string,
    rewardType,
    creditAmount: raw.creditAmount as number,
    propertyId: propertyId?.toString() ?? null,
    unitId: unitId?.toString() ?? null,
    createdAt: new Date(raw.createdAt as Date).toISOString(),
    updatedAt: new Date(raw.updatedAt as Date).toISOString(),
    behaviors: triggerEventToBehaviors(raw.triggerEvent as string),
    budget: budgetUsd ?? null,
    participants: metricsBlock.participantCount,
    duration: durationLabel,
    metrics: metricsBlock,
    display: {
      durationLabel,
      budgetSummary: {
        budgetUsd: budgetUsd ?? null,
        usedUsd: metricsBlock.budgetUsedUsd,
        usedPercent: metricsBlock.budgetUsedPercent,
      },
    },
  };
}

const emptyMetrics = (): CampaignLedgerMetrics => ({
  participantCount: 0,
  tokensIssued: 0,
});

export async function createCampaign(
  orgId: string,
  dto: CreateCampaignPayload,
  createdByUserId?: mongoose.Types.ObjectId
) {
  if (!mongoose.Types.ObjectId.isValid(orgId)) {
    throw new AppError('Invalid org ID', 400);
  }

  const doc: Record<string, unknown> = {
    orgId: new mongoose.Types.ObjectId(orgId),
    name: dto.name,
    status: dto.status,
    triggerEvent: dto.triggerEvent,
    rewardType: dto.rewardType ?? 'POINTS',
    creditAmount: dto.creditAmount,
  };

  if (dto.description !== undefined) doc.description = dto.description;
  if (dto.goal !== undefined) doc.goal = dto.goal;
  if (dto.startsAt !== undefined) doc.startsAt = dto.startsAt;
  if (dto.endsAt !== undefined) doc.endsAt = dto.endsAt;
  if (dto.budgetUsd !== undefined) doc.budgetUsd = dto.budgetUsd;
  if (dto.budgetTokenCap !== undefined) doc.budgetTokenCap = dto.budgetTokenCap;
  if (dto.suggestionHeadline !== undefined) doc.suggestionHeadline = dto.suggestionHeadline;
  if (dto.suggestionDetail !== undefined) doc.suggestionDetail = dto.suggestionDetail;
  if (createdByUserId) doc.createdByUserId = createdByUserId;

  if (dto.propertyId) {
    if (!mongoose.Types.ObjectId.isValid(dto.propertyId)) {
      throw new AppError('Invalid propertyId', 400);
    }
    doc.propertyId = new mongoose.Types.ObjectId(dto.propertyId);
  }
  if (dto.unitId) {
    if (!mongoose.Types.ObjectId.isValid(dto.unitId)) {
      throw new AppError('Invalid unitId', 400);
    }
    doc.unitId = new mongoose.Types.ObjectId(dto.unitId);
  }

  const created = await CampaignModel.create(doc);
  const plain = created.toObject() as unknown as Record<string, unknown>;
  return toPublicCampaign(plain, emptyMetrics());
}

export async function listCampaigns(orgId: string) {
  if (!mongoose.Types.ObjectId.isValid(orgId)) {
    throw new AppError('Invalid org ID', 400);
  }
  const list = await CampaignModel.find({ orgId: new mongoose.Types.ObjectId(orgId) })
    .sort({ updatedAt: -1 })
    .lean();

  const ids = list.map((c) => c._id as mongoose.Types.ObjectId);
  const metricsMap = await getCampaignMetricsMap(ids);

  return list.map((c) => {
    const plain = c as unknown as Record<string, unknown>;
    const mid = (c._id as mongoose.Types.ObjectId).toString();
    const m = metricsMap.get(mid) ?? emptyMetrics();
    return toPublicCampaign(plain, m);
  });
}

export async function updateCampaign(
  orgId: string,
  campaignId: string,
  dto: UpdateCampaignPayload
) {
  if (!mongoose.Types.ObjectId.isValid(orgId) || !mongoose.Types.ObjectId.isValid(campaignId)) {
    throw new AppError('Invalid id', 400);
  }

  const existing = await CampaignModel.findOne({
    _id: new mongoose.Types.ObjectId(campaignId),
    orgId: new mongoose.Types.ObjectId(orgId),
  });
  if (!existing) {
    throw new AppError('Campaign not found', 404);
  }

  if (dto.name !== undefined) existing.name = dto.name;
  if (dto.description !== undefined) existing.description = dto.description;
  if (dto.goal !== undefined) existing.goal = dto.goal ?? undefined;
  if (dto.suggestionHeadline !== undefined) {
    existing.suggestionHeadline = dto.suggestionHeadline ?? undefined;
  }
  if (dto.suggestionDetail !== undefined) {
    existing.suggestionDetail = dto.suggestionDetail ?? undefined;
  }
  if (dto.status !== undefined) existing.status = dto.status;
  if (dto.triggerEvent !== undefined) {
    existing.triggerEvent = dto.triggerEvent as CampaignTriggerEvent;
  }
  if (dto.rewardType !== undefined) existing.rewardType = dto.rewardType;
  if (dto.creditAmount !== undefined) existing.creditAmount = dto.creditAmount;

  if (dto.startsAt !== undefined) {
    existing.startsAt = dto.startsAt ?? undefined;
  }
  if (dto.endsAt !== undefined) {
    existing.endsAt = dto.endsAt ?? undefined;
  }
  if (dto.budgetUsd !== undefined) {
    existing.budgetUsd = dto.budgetUsd ?? undefined;
  }
  if (dto.budgetTokenCap !== undefined) {
    existing.budgetTokenCap = dto.budgetTokenCap ?? undefined;
  }

  if (dto.propertyId !== undefined) {
    if (dto.propertyId === null) {
      existing.propertyId = undefined;
    } else if (mongoose.Types.ObjectId.isValid(dto.propertyId)) {
      existing.propertyId = new mongoose.Types.ObjectId(dto.propertyId);
    } else {
      throw new AppError('Invalid propertyId', 400);
    }
  }
  if (dto.unitId !== undefined) {
    if (dto.unitId === null) {
      existing.unitId = undefined;
    } else if (mongoose.Types.ObjectId.isValid(dto.unitId)) {
      existing.unitId = new mongoose.Types.ObjectId(dto.unitId);
    } else {
      throw new AppError('Invalid unitId', 400);
    }
  }

  if (
    existing.startsAt &&
    existing.endsAt &&
    existing.endsAt.getTime() < existing.startsAt.getTime()
  ) {
    throw new AppError('endsAt must be on or after startsAt', 400);
  }

  await existing.save();
  const plain = existing.toObject() as unknown as Record<string, unknown>;
  const metricsMap = await getCampaignMetricsMap([existing._id]);
  const m = metricsMap.get(existing._id.toString()) ?? emptyMetrics();
  return toPublicCampaign(plain, m);
}
