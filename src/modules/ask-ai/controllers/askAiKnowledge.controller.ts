import { Response } from 'express';
import mongoose from 'mongoose';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { AskAiKnowledgeDocModel, type SourceType, type AudienceRole } from '../models/askAiKnowledgeDoc.model';
import { insertDoc, vectorSearch } from '../services/askAiKnowledge.service';
import { embedQuery } from '../../ai/services/embedder.service';
import {
  createKnowledgeDocBodySchema,
  listKnowledgeDocsQuerySchema,
  searchKnowledgeBodySchema,
} from '../dto/askAiKnowledge.dto';
import { logger } from '../../../core/logger';
import { writeAuditEvent } from '../../audit/services/audit.service';

const LIST_DEFAULT_LIMIT = 20;
const LIST_MAX_LIMIT = 100;

export async function listKnowledgeDocsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const query = listKnowledgeDocsQuerySchema.safeParse(req.query);
    if (!query.success) {
      errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid query', query.error.flatten());
      return;
    }
    const { sourceType, audienceRole, limit = LIST_DEFAULT_LIMIT, cursor } = query.data;
    const safeLimit = Math.min(Math.max(1, limit), LIST_MAX_LIMIT);

    const filter: mongoose.FilterQuery<any> = {};
    if (sourceType) filter.sourceType = sourceType;
    if (audienceRole) filter.audienceRole = audienceRole;
    if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
      filter._id = { $gt: new mongoose.Types.ObjectId(cursor) };
    }

    const docs = await AskAiKnowledgeDocModel.find(filter)
      .sort({ _id: 1 })
      .limit(safeLimit + 1)
      .select('-embedding')
      .lean();

    const hasMore = docs.length > safeLimit;
    const page = hasMore ? docs.slice(0, safeLimit) : docs;
    const nextCursor =
      hasMore && page.length > 0 ? (page[page.length - 1] as any)._id.toString() : null;

    const items = page.map((d: any) => ({
      id: d._id.toString(),
      title: d.title,
      sourceType: d.sourceType,
      audienceRole: d.audienceRole,
      content: d.content,
      version: d.version,
      createdAt: d.createdAt,
    }));

    successResponse(res, { docs: items, nextCursor });
  } catch (e) {
    logger.error({ err: e }, 'listKnowledgeDocs failed');
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to list knowledge docs');
  }
}

export async function createKnowledgeDocHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const body = createKnowledgeDocBodySchema.safeParse(req.body);
    if (!body.success) {
      errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid body', body.error.flatten());
      return;
    }
    const embedding = await embedQuery(body.data.content);
    const doc = await insertDoc({
      title: body.data.title,
      sourceType: body.data.sourceType as SourceType,
      audienceRole: body.data.audienceRole as AudienceRole,
      content: body.data.content,
      version: body.data.version,
      embedding,
    });
    const created = doc as unknown as { _id: mongoose.Types.ObjectId; createdAt: Date };
    if (req.auth?._id) {
      await writeAuditEvent({
        actorUserId: req.auth._id,
        action: 'ASK_AI_KNOWLEDGE_DOC_CREATED',
        entityType: 'DOCUMENT',
        entityId: created._id,
        metadata: {
          title: doc.title,
          sourceType: String(doc.sourceType),
          audienceRole: String(doc.audienceRole),
          version: doc.version,
        },
        diff: { before: null, after: { title: doc.title, version: doc.version } },
      });
    }
    const payload: { id: string; title: string; sourceType: string; audienceRole: string; version: string; createdAt: Date } = {
      id: created._id.toString(),
      title: doc.title,
      sourceType: String(doc.sourceType),
      audienceRole: String(doc.audienceRole),
      version: doc.version,
      createdAt: created.createdAt ?? doc.createdAt,
    };
    successResponse(res, payload, 201);
  } catch (e) {
    logger.error({ err: e }, 'createKnowledgeDoc failed');
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to create knowledge doc');
  }
}

export async function searchKnowledgeHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const body = searchKnowledgeBodySchema.safeParse(req.body);
    if (!body.success) {
      errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid body', body.error.flatten());
      return;
    }
    const queryEmbedding = await embedQuery(body.data.query);
    const results = await vectorSearch(queryEmbedding, {
      limit: body.data.limit,
      audienceRole: body.data.audienceRole,
      sourceType: body.data.sourceType as SourceType | undefined,
    });
    successResponse(res, { results });
  } catch (e) {
    logger.error({ err: e }, 'searchKnowledge failed');
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to search knowledge');
  }
}
