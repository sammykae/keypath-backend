import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import { DocumentModel, DocumentStatus } from '../../docs/models/document.model';
import { resolveLandlordOrgId } from '../services/landlordDashboard.service';
import { writeAuditEvent } from '../../audit/services/audit.service';

const ALLOWED_STATUSES = [
  DocumentStatus.COMPLETED,
  DocumentStatus.NEEDS_REVIEW,
  DocumentStatus.FAILED,
  DocumentStatus.PROCESSING,
] as const;

export async function updateComplianceDocStatusHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.auth?._id) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const { docId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(docId)) {
      errorResponse(res, 400, 'INVALID_ID', 'Invalid document ID');
      return;
    }

    const { status, error } = req.body;
    if (!status || !ALLOWED_STATUSES.includes(status)) {
      errorResponse(res, 400, 'INVALID_STATUS', `status must be one of: ${ALLOWED_STATUSES.join(', ')}`);
      return;
    }

    const orgId = await resolveLandlordOrgId(req.auth._id as any);
    const orgOid = new mongoose.Types.ObjectId(orgId);

    const doc = await DocumentModel.findOne({
      _id: new mongoose.Types.ObjectId(docId),
      orgId: orgOid,
    });
    if (!doc) {
      errorResponse(res, 404, 'NOT_FOUND', 'Document not found');
      return;
    }

    const prevStatus = doc.status;
    doc.status = status;
    if (typeof error === 'string') doc.error = error;
    else if (status === DocumentStatus.COMPLETED) doc.error = undefined;
    await doc.save();

    await writeAuditEvent({
      actorUserId: req.auth._id as any,
      orgId: orgOid,
      action: 'DOCUMENT_STATUS_UPDATED',
      entityType: 'DOCUMENT',
      entityId: doc._id as any,
      propertyId: doc.propertyId,
      metadata: { from: prevStatus, to: status },
      diff: { before: { status: prevStatus }, after: { status } },
    });

    successResponse(res, {
      id: (doc._id as any).toString(),
      status: doc.status,
      error: doc.error ?? null,
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'COMPLIANCE_UPDATE_FAILED', err.message);
      return;
    }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to update document status');
  }
}
