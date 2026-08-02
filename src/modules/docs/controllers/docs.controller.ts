import { Response } from 'express';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { resolveOrgIdForUser } from '../../chat/services/participantRules.service';
import { uploadFile, completeDocument, listDocuments } from '../services/docs.service';
import { completeDocBodySchema, listDocsQuerySchema } from '../dto/docs.dto';
import { logger } from '../../../core/logger';
import { writeAuditEvent } from '../../audit/services/audit.service';
import mongoose from 'mongoose';

export async function uploadUrlHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const userId = req.auth._id.toString();
    const orgId = await resolveOrgIdForUser(userId);
    if (!orgId) {
      errorResponse(res, 400, 'ORG_REQUIRED', 'User must belong to an organization');
      return;
    }
    const file = (req as any).file;
    if (!file || !Buffer.isBuffer(file.buffer)) {
      errorResponse(res, 400, 'VALIDATION_ERROR', 'Missing file: send multipart form with field "file"');
      return;
    }
    const { fileKey, publicUrl } = await uploadFile({
      orgId: orgId.toString(),
      buffer: file.buffer,
      contentType: file.mimetype,
      fileName: file.originalname,
    });
    successResponse(res, { fileKey, publicUrl }, 201);
  } catch (e) {
    logger.error({ err: e }, 'upload failed');
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to upload file');
  }
}

export async function completeDocHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const userId = req.auth._id.toString();
    const orgId = await resolveOrgIdForUser(userId);
    if (!orgId) {
      errorResponse(res, 400, 'ORG_REQUIRED', 'User must belong to an organization');
      return;
    }
    const body = completeDocBodySchema.safeParse(req.body);
    if (!body.success) {
      errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid body', body.error.flatten());
      return;
    }
    const doc = await completeDocument({
      orgId: orgId.toString(),
      uploaderUserId: userId,
      fileKey: body.data.fileKey,
      type: body.data.type,
      status: body.data.status,
      error: body.data.error,
      propertyId: body.data.propertyId,
      unitId: body.data.unitId,
    });
    const created = doc as unknown as { _id: { toString(): string }; orgId: { toString(): string }; uploaderUserId: { toString(): string }; propertyId?: { toString(): string }; unitId?: { toString(): string }; createdAt: Date; error?: string };
    const orgOid = new mongoose.Types.ObjectId(orgId);
    const docOid = new mongoose.Types.ObjectId(created._id.toString());
    const propertyOid =
      body.data.propertyId && mongoose.Types.ObjectId.isValid(body.data.propertyId)
        ? new mongoose.Types.ObjectId(body.data.propertyId)
        : undefined;
    await writeAuditEvent({
      actorUserId: new mongoose.Types.ObjectId(userId),
      orgId: orgOid,
      action: 'DOCUMENT_REGISTERED',
      entityType: 'DOCUMENT',
      entityId: docOid,
      propertyId: propertyOid,
      metadata: {
        fileKey: body.data.fileKey,
        type: body.data.type,
        status: body.data.status,
        unitId: body.data.unitId,
      },
      diff: {
        before: null,
        after: {
          fileKey: body.data.fileKey,
          type: body.data.type,
          status: body.data.status,
        },
      },
    });
    const t = body.data.type.toLowerCase();
    const csvByKey = body.data.fileKey.toLowerCase().endsWith('.csv');
    if (csvByKey || t === 'csv' || t.includes('csv')) {
      await writeAuditEvent({
        actorUserId: new mongoose.Types.ObjectId(userId),
        orgId: orgOid,
        action: 'CSV_IMPORT_REGISTERED',
        entityType: 'CSV_IMPORT',
        entityId: docOid,
        propertyId: propertyOid,
        metadata: { fileKey: body.data.fileKey, documentType: body.data.type, source: 'docs.complete' },
        diff: { before: null, after: { fileKey: body.data.fileKey, type: body.data.type } },
      });
    }
    successResponse(
      res,
      {
        id: created._id.toString(),
        orgId: created.orgId.toString(),
        uploaderUserId: created.uploaderUserId.toString(),
        fileKey: doc.fileKey,
        type: doc.type,
        status: doc.status,
        error: created.error,
        propertyId: created.propertyId?.toString(),
        unitId: created.unitId?.toString(),
        createdAt: created.createdAt,
      },
      201
    );
  } catch (e: any) {
    logger.error({ err: e }, 'completeDoc failed');
    if (e?.code === 11000) {
      errorResponse(res, 409, 'DUPLICATE_FILEKEY', 'Document already registered for this fileKey');
      return;
    }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to register document');
  }
}

export async function listDocsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const userId = req.auth._id.toString();
    const orgId = await resolveOrgIdForUser(userId);
    if (!orgId) {
      errorResponse(res, 400, 'ORG_REQUIRED', 'User must belong to an organization');
      return;
    }
    const query = listDocsQuerySchema.safeParse(req.query);
    if (!query.success) {
      errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid query', query.error.flatten());
      return;
    }
    const { docs, nextCursor } = await listDocuments({
      orgId: orgId.toString(),
      status: query.data.status,
      type: query.data.type,
      propertyId: query.data.propertyId,
      unitId: query.data.unitId,
      limit: query.data.limit,
      cursor: query.data.cursor,
    });
    const items = docs.map((d: any) => ({
      id: d._id.toString(),
      orgId: d.orgId.toString(),
      uploaderUserId: d.uploaderUserId.toString(),
      fileKey: d.fileKey,
      type: d.type,
      status: d.status,
      error: d.error,
      propertyId: d.propertyId?.toString(),
      unitId: d.unitId?.toString(),
      createdAt: d.createdAt,
    }));
    successResponse(res, { docs: items, nextCursor });
  } catch (e) {
    logger.error({ err: e }, 'listDocs failed');
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to list documents');
  }
}
