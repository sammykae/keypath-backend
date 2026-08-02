import mongoose from 'mongoose';
import { AiContextCacheModel } from '../models/aiContextCache.model';
import { buildPropertyAiContextPayload } from './aiContextPropertyPayload.service';
import { AI_CONTEXT_CACHE_TTL_MS } from '../config/askAi.config';
import { logger } from '../../../core/logger';
import { isNormalizedAiContextPayload } from '../types/aiContextCache.types';

export const AI_CONTEXT_ENTITY_PROPERTY = 'PROPERTY';

export async function getOrRefreshPropertyContextPayload(
  propertyIdStr: string
): Promise<Record<string, unknown> | null> {
  if (!mongoose.Types.ObjectId.isValid(propertyIdStr)) return null;

  const propertyId = new mongoose.Types.ObjectId(propertyIdStr);
  const now = Date.now();

  try {
    const existing = await AiContextCacheModel.findOne({
      entityType: AI_CONTEXT_ENTITY_PROPERTY,
      entityId: propertyId,
    }).lean();

    const fresh =
      !!existing?.generatedAt &&
      now - new Date(existing.generatedAt).getTime() < AI_CONTEXT_CACHE_TTL_MS;
    if (existing?.payload && fresh && isNormalizedAiContextPayload(existing.payload)) {
      return existing.payload;
    }

    const payload = await buildPropertyAiContextPayload(propertyId);
    if (!payload) return null;

    await AiContextCacheModel.findOneAndUpdate(
      { entityType: AI_CONTEXT_ENTITY_PROPERTY, entityId: propertyId },
      {
        $set: {
          payload,
          generatedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    return payload;
  } catch (error) {
    logger.warn({ error, propertyId: propertyIdStr }, 'ai_context_cache refresh failed');
    return null;
  }
}
