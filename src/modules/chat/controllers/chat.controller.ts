import { Response } from 'express';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { listThreads, createThread, getThread, getMessages, sendMessage, findOrCreateDirectThread, markThreadRead } from '../services/chat.service';
import { resolveOrgIdForUser } from '../services/participantRules.service';
import {
  listThreadsQuerySchema,
  getMessagesQuerySchema,
  sendMessageBodySchema,
  createThreadBodySchema,
} from '../dto/chat.dto';
import { ZodError } from 'zod';
import { logger } from '../../../core/logger';

export async function listThreadsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }

    const userId = req.auth._id.toString();
    const orgId = await resolveOrgIdForUser(userId);
    const role = req.auth.role ?? 'tenant';

    const query = listThreadsQuerySchema.safeParse(req.query);
    if (!query.success) {
      errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid query', query.error.flatten());
      return;
    }

    const result = await listThreads({
      userId,
      orgId: orgId?.toString() ?? null,
      role,
      limit: query.data.limit,
      cursor: query.data.cursor,
    });

    successResponse(res, { threads: result.threads, nextCursor: result.nextCursor });
  } catch (e) {
    if (e instanceof ZodError) {
      errorResponse(res, 400, 'VALIDATION_ERROR', 'Validation failed', e.flatten());
      return;
    }
    logger.error({ err: e }, 'listThreads failed');
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to list threads');
  }
}

export async function createThreadHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const userId = req.auth._id.toString();
    const body = createThreadBodySchema.safeParse(req.body);
    if (!body.success) {
      errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid body', body.error.flatten());
      return;
    }
    let orgId = body.data.orgId;
    if (!orgId) {
      const resolved = await resolveOrgIdForUser(userId);
      if (!resolved) {
        errorResponse(res, 400, 'ORG_REQUIRED', 'orgId is required or user must belong to an organization (tenancy or membership)');
        return;
      }
      orgId = resolved.toString();
    }
    const result = await createThread({
      creatorUserId: userId,
      orgId,
      participantUserIds: body.data.participantUserIds,
      title: body.data.title ?? null,
      type: body.data.type,
    });
    if (!result) {
      errorResponse(res, 403, 'FORBIDDEN', 'Cannot create thread in this organization or with these participants');
      return;
    }
    successResponse(res, result, 201);
  } catch (e) {
    if (e instanceof ZodError) {
      errorResponse(res, 400, 'VALIDATION_ERROR', 'Validation failed', e.flatten());
      return;
    }
    logger.error({ err: e }, 'createThread failed');
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to create thread');
  }
}

export async function getThreadHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }

    const threadId = req.params.id;
    const userId = req.auth._id.toString();

    if (!/^[0-9a-fA-F]{24}$/.test(threadId)) {
      errorResponse(res, 400, 'INVALID_ID', 'Invalid thread id');
      return;
    }

    const thread = await getThread(threadId, userId);
    if (!thread) {
      errorResponse(res, 403, 'FORBIDDEN', 'You do not have access to this thread');
      return;
    }

    successResponse(res, thread);
  } catch (e) {
    logger.error({ err: e }, 'getThread failed');
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to get thread');
  }
}

export async function getMessagesHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }

    const threadId = req.params.id;
    const userId = req.auth._id.toString();

    if (!/^[0-9a-fA-F]{24}$/.test(threadId)) {
      errorResponse(res, 400, 'INVALID_ID', 'Invalid thread id');
      return;
    }

    const query = getMessagesQuerySchema.safeParse(req.query);
    if (!query.success) {
      errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid query', query.error.flatten());
      return;
    }

    const result = await getMessages({
      conversationId: threadId,
      userId,
      limit: query.data.limit,
      cursor: query.data.cursor,
    });

    if (!result) {
      errorResponse(res, 403, 'FORBIDDEN', 'You do not have access to this thread');
      return;
    }

    successResponse(res, { messages: result.messages, nextCursor: result.nextCursor });
  } catch (e) {
    if (e instanceof ZodError) {
      errorResponse(res, 400, 'VALIDATION_ERROR', 'Validation failed', e.flatten());
      return;
    }
    logger.error({ err: e }, 'getMessages failed');
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to get messages');
  }
}

export async function sendMessageHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }

    const threadId = req.params.id;
    const userId = req.auth._id.toString();

    if (!/^[0-9a-fA-F]{24}$/.test(threadId)) {
      errorResponse(res, 400, 'INVALID_ID', 'Invalid thread id');
      return;
    }

    const body = sendMessageBodySchema.safeParse(req.body);
    if (!body.success) {
      errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid body', body.error.flatten());
      return;
    }

    const message = await sendMessage({
      conversationId: threadId,
      senderUserId: userId,
      body: body.data.body,
      attachments: body.data.attachments,
    });

    if (!message) {
      errorResponse(res, 403, 'FORBIDDEN', 'You do not have access to this thread or cannot send messages');
      return;
    }

    successResponse(res, message, 201);
  } catch (e) {
    if (e instanceof ZodError) {
      errorResponse(res, 400, 'VALIDATION_ERROR', 'Validation failed', e.flatten());
      return;
    }
    logger.error({ err: e }, 'sendMessage failed');
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to send message');
  }
}

export async function markThreadReadHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth) { errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required'); return; }
    const { id } = req.params;
    if (!/^[0-9a-fA-F]{24}$/.test(id)) { errorResponse(res, 400, 'INVALID_ID', 'Invalid thread id'); return; }
    await markThreadRead(id, req.auth._id.toString());
    successResponse(res, { ok: true });
  } catch (e) {
    logger.error({ err: e }, 'markThreadRead failed');
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to mark thread as read');
  }
}

export async function findOrCreateThreadHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth) { errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required'); return; }
    const { userId: targetUserId } = req.params;
    if (!/^[0-9a-fA-F]{24}$/.test(targetUserId)) {
      errorResponse(res, 400, 'INVALID_ID', 'Invalid user id'); return;
    }
    const orgOid = await resolveOrgIdForUser(req.auth._id.toString());
    if (!orgOid) { errorResponse(res, 400, 'NO_ORG', 'No organization found'); return; }
    const propertyId: string | undefined = req.body?.propertyId;
    const result = await findOrCreateDirectThread(req.auth._id.toString(), targetUserId, orgOid.toString(), propertyId);
    if (!result) { errorResponse(res, 403, 'FORBIDDEN', 'Cannot create thread with this user'); return; }
    successResponse(res, result, result.isNew ? 201 : 200);
  } catch (e) {
    logger.error({ err: e }, 'findOrCreateThread failed');
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to find or create thread');
  }
}
