import mongoose from 'mongoose';
import { logActivity } from '../../activities/services/activityLogger';
import { AskAiAuditAction, AskAiAuditMeta } from '../types/askAi.types';
import { logger } from '../../../core/logger';

interface LogAskAiActivityParams {
  userId: string;
  orgId: string;
  action: AskAiAuditAction;
  meta: AskAiAuditMeta;
}

export const logAskAiActivity = async (params: LogAskAiActivityParams): Promise<void> => {
  const { userId, orgId, action, meta } = params;

  const isValidObjectId = (value: string): boolean => {
    return mongoose.Types.ObjectId.isValid(value);
  };

  if (!isValidObjectId(userId) || !isValidObjectId(orgId)) {
    logger.warn(
      { userId, orgId, action },
      'Skipping Ask AI activity logging due to invalid ObjectId'
    );
    return;
  }

  try {
    await logActivity({
      orgId,
      entityType: 'ask-ai',
      entityId: userId,
      actorId: userId,
      action,
      meta: {
        ...meta,
        timestamp: new Date().toISOString(),
      },
    });

    logger.debug(
      {
        userId,
        orgId,
        action,
        mode: meta.mode,
      },
      'Ask AI activity logged'
    );
  } catch (error) {
    logger.error({ error, userId, action }, 'Failed to log Ask AI activity');
  }
};

