import mongoose from 'mongoose';
import { logger } from '../../../core/logger';
import { isAskAiEnabled } from '../config/askAi.config';
import { writeAuditEvent } from '../../audit/services/audit.service';
import { logActivity } from '../../activities/services/activityLogger';
import { Membership } from '../../orgs/models/membership.model';
import {
  ASK_AI_FEATURE_FLAG_NAME,
  AskAiFeatureFlagModel,
} from '../models/askAiFeatureFlag.model';

// Small TTL to allow near-instant toggles while reducing DB hits.
const RUNTIME_FLAG_CACHE_TTL_MS = 5000;

type CachedRuntimeFlag = {
  value: boolean | null;
  expiresAt: number;
};

let runtimeFlagCache: CachedRuntimeFlag | null = null;

export type AskAiFlagSource = 'runtime' | 'env';

export interface AskAiFlagStatus {
  enabled: boolean;
  source: AskAiFlagSource;
  updatedAt: string | null;
  updatedByUserId: string | null;
}

const readRuntimeFlagValue = async (): Promise<boolean | null> => {
  const now = Date.now();
  // Serve cached value when fresh to avoid querying on every request.
  if (runtimeFlagCache && runtimeFlagCache.expiresAt > now) {
    return runtimeFlagCache.value;
  }

  try {
    const doc = await AskAiFeatureFlagModel.findOne({ name: ASK_AI_FEATURE_FLAG_NAME })
      .select('enabled')
      .lean();
    const value = doc ? Boolean(doc.enabled) : null;
    runtimeFlagCache = {
      value,
      expiresAt: now + RUNTIME_FLAG_CACHE_TTL_MS,
    };
    return value;
  } catch (error) {
    logger.warn({ error }, 'Failed to read Ask AI runtime feature flag, falling back to env');
    runtimeFlagCache = {
      value: null,
      expiresAt: now + RUNTIME_FLAG_CACHE_TTL_MS,
    };
    return null;
  }
};

const invalidateRuntimeCache = (): void => {
  runtimeFlagCache = null;
};

const resolveActorOrgIdForActivity = async (
  actorOrgId?: string | null,
  actorUserId?: string
): Promise<string | null> => {
  if (actorOrgId && mongoose.Types.ObjectId.isValid(actorOrgId)) {
    return actorOrgId;
  }
  if (!actorUserId || !mongoose.Types.ObjectId.isValid(actorUserId)) {
    return null;
  }

  // Fallback for tokens without orgId: use actor's first active membership org.
  const membership = await Membership.findOne({
    userId: new mongoose.Types.ObjectId(actorUserId),
    status: 'active',
  })
    .select('orgId')
    .lean();

  return membership?.orgId ? membership.orgId.toString() : null;
};

export const resolveAskAiFlagStatus = async (): Promise<AskAiFlagStatus> => {
  const runtimeValue = await readRuntimeFlagValue();
  if (runtimeValue != null) {
    // Runtime DB flag exists and overrides env.
    const doc = await AskAiFeatureFlagModel.findOne({ name: ASK_AI_FEATURE_FLAG_NAME })
      .select('updatedAt updatedByUserId')
      .lean();
    return {
      enabled: runtimeValue,
      source: 'runtime',
      updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
      updatedByUserId: doc?.updatedByUserId ? doc.updatedByUserId.toString() : null,
    };
  }

  return {
    // No runtime override found: use env-based default.
    enabled: isAskAiEnabled(),
    source: 'env',
    updatedAt: null,
    updatedByUserId: null,
  };
};

export const isAskAiEnabledRuntime = async (): Promise<boolean> => {
  const runtimeValue = await readRuntimeFlagValue();
  if (runtimeValue != null) return runtimeValue;
  return isAskAiEnabled();
};

export const setAskAiRuntimeFlag = async (
  enabled: boolean,
  actorUserId?: string,
  actorOrgId?: string | null
): Promise<AskAiFlagStatus> => {
  const previous = await AskAiFeatureFlagModel.findOne({ name: ASK_AI_FEATURE_FLAG_NAME })
    .select('_id enabled')
    .lean();

  const update: {
    enabled: boolean;
    updatedByUserId?: mongoose.Types.ObjectId;
  } = { enabled };

  if (actorUserId && mongoose.Types.ObjectId.isValid(actorUserId)) {
    update.updatedByUserId = new mongoose.Types.ObjectId(actorUserId);
  }

  const updated = await AskAiFeatureFlagModel.findOneAndUpdate(
    { name: ASK_AI_FEATURE_FLAG_NAME },
    { $set: update, $setOnInsert: { name: ASK_AI_FEATURE_FLAG_NAME } },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );

  // Audit log for security-sensitive kill-switch updates.
  await writeAuditEvent({
    actorUserId: actorUserId && mongoose.Types.ObjectId.isValid(actorUserId)
      ? new mongoose.Types.ObjectId(actorUserId)
      : undefined,
    action: 'ASK_AI_FEATURE_FLAG_UPDATED',
    entityType: 'AskAiFeatureFlag',
    entityId: updated?._id,
    source: 'user',
    updateType: 'manual',
    diff: {
      before: { enabled: previous?.enabled ?? null },
      after: { enabled },
    },
  });

  // Activity feed log for org dashboards when actor org context is available.
  const resolvedOrgId = await resolveActorOrgIdForActivity(actorOrgId, actorUserId);
  if (
    resolvedOrgId &&
    actorUserId &&
    mongoose.Types.ObjectId.isValid(actorUserId) &&
    updated?._id
  ) {
    await logActivity({
      orgId: resolvedOrgId,
      entityType: 'ask-ai',
      entityId: updated._id,
      actorId: actorUserId,
      action: 'ASK_AI_FEATURE_FLAG_UPDATED',
      meta: {
        beforeEnabled: previous?.enabled ?? null,
        afterEnabled: enabled,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Ensure subsequent reads observe the latest value immediately.
  invalidateRuntimeCache();
  return resolveAskAiFlagStatus();
};
