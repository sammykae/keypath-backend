import mongoose from 'mongoose';
import { CampaignModel } from '../models/campaign.model';
import type { CampaignTriggerEvent } from '../types/campaignTriggerEvent';
import { findOrCreateCreditAccount } from '../../ledger/services/ledgerService';
import { createCreditEventWithIdempotency } from '../../ledger/services/idempotencyService';
import { CreditEventType } from '../../ledger/types/creditEventTypes';
import { writeAuditEvent } from '../../audit/services/audit.service';
import { getCampaignMetricsMap } from './campaignMetrics.service';

export interface CampaignDispatchPayload {
  orgId: string;
  triggerEvent: CampaignTriggerEvent;
  tenantUserId: string;
  unitId?: string;
  propertyId?: string;
  /** Stable id for idempotency (e.g. tenancy _id or payment _id) */
  correlationId: string;
}

export interface CampaignDispatchResult {
  applied: Array<{
    campaignId: string;
    isNew: boolean;
    creditAmount: number;
    eventId?: string;
  }>;
}

function scopeMatches(
  campaign: {
    propertyId?: mongoose.Types.ObjectId | null;
    unitId?: mongoose.Types.ObjectId | null;
  },
  propertyId?: string,
  unitId?: string
): boolean {
  if (campaign.unitId) {
    if (!unitId || campaign.unitId.toString() !== unitId) return false;
  }
  if (campaign.propertyId) {
    if (!propertyId || campaign.propertyId.toString() !== propertyId) return false;
  }
  return true;
}

/**
 * Evaluates active campaigns for the org/event and appends CREDIT ledger entries (idempotent per campaign + correlation).
 */
export async function dispatchCampaignRewards(
  payload: CampaignDispatchPayload
): Promise<CampaignDispatchResult> {
  const { orgId, triggerEvent, tenantUserId, unitId, propertyId, correlationId } = payload;

  if (!mongoose.Types.ObjectId.isValid(orgId) || !mongoose.Types.ObjectId.isValid(tenantUserId)) {
    return { applied: [] };
  }

  const orgOid = new mongoose.Types.ObjectId(orgId);
  const campaigns = await CampaignModel.find({
    orgId: orgOid,
    status: 'ACTIVE',
    triggerEvent,
    creditAmount: { $gt: 0 },
  }).lean();

  const metricsMap = await getCampaignMetricsMap(
    campaigns.map((c) => c._id as mongoose.Types.ObjectId)
  );

  const now = new Date();
  const applied: CampaignDispatchResult['applied'] = [];

  for (const c of campaigns) {
    if (!scopeMatches(c, propertyId, unitId)) continue;

    if (c.startsAt && now < new Date(c.startsAt)) continue;
    if (c.endsAt && now > new Date(c.endsAt)) continue;

    const cap =
      c.budgetTokenCap != null && c.budgetTokenCap > 0 ? c.budgetTokenCap : null;
    if (cap != null) {
      const issued = metricsMap.get(c._id.toString())?.tokensIssued ?? 0;
      if (issued + c.creditAmount > cap) continue;
    }

    const campaignId = c._id.toString();
    const idempotencyKey = `campaign:${campaignId}:${correlationId}`;

    const account = await findOrCreateCreditAccount({
      tenantUserId,
      orgId,
      unitId,
    });
    const accountId = (account as { _id: mongoose.Types.ObjectId })._id;

    const description = `Campaign: ${c.name} (${triggerEvent})`;

    const result = await createCreditEventWithIdempotency(
      {
        accountId,
        type: CreditEventType.CREDIT,
        amount: c.creditAmount,
        occurredAt: new Date(),
        description,
        referenceId: c._id,
      },
      idempotencyKey
    );

    if (result.isNew) {
      await writeAuditEvent({
        orgId: orgOid,
        action: 'CAMPAIGN_CREDITS_ISSUED',
        entityType: 'Campaign',
        entityId: c._id,
        diff: {
          after: {
            tenantUserId,
            unitId: unitId ?? null,
            propertyId: propertyId ?? null,
            creditAmount: c.creditAmount,
            triggerEvent,
            correlationId,
            creditEventId: result.event._id.toString(),
          },
        },
      });

      const prev = metricsMap.get(campaignId);
      metricsMap.set(campaignId, {
        tokensIssued: (prev?.tokensIssued ?? 0) + c.creditAmount,
        participantCount: prev?.participantCount ?? 0,
      });
    }

    applied.push({
      campaignId,
      isNew: result.isNew,
      creditAmount: c.creditAmount,
      eventId: result.event._id.toString(),
    });
  }

  return { applied };
}

/**
 * Fire-and-forget safe wrapper for domain hooks (does not fail the primary transaction).
 */
export async function dispatchCampaignRewardsSafe(
  payload: CampaignDispatchPayload
): Promise<void> {
  try {
    await dispatchCampaignRewards(payload);
  } catch (err) {
    console.error('[CAMPAIGN_DISPATCH_FAILED]', payload.triggerEvent, err);
  }
}
