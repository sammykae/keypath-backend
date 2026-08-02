import crypto from 'crypto';
import mongoose from 'mongoose';
import { DocumentModel, DocumentStatus, type IDocument, type DocumentStatusType } from '../models/document.model';
import { storage } from '../storage';

const S3_KEY_PREFIX = process.env.AWS_S3_DOCS_PREFIX || 'docs';

function normalizeStatus(status: string | undefined): string {
  if (!status || status === 'uploaded') return DocumentStatus.PROCESSING;
  if (Object.values(DocumentStatus).includes(status as any)) return status;
  return DocumentStatus.PROCESSING;
}

export async function uploadFile(params: {
  orgId: string;
  buffer: Buffer;
  contentType?: string;
  fileName?: string;
}): Promise<{ fileKey: string; publicUrl: string }> {
  const key = `${S3_KEY_PREFIX}/${params.orgId}/${crypto.randomUUID()}${params.fileName ? `_${params.fileName.replace(/\s+/g, '-')}` : ''}`;
  return storage.put(key, params.buffer, params.contentType);
}

export async function completeDocument(params: {
  orgId: string;
  uploaderUserId: string;
  fileKey: string;
  type: string;
  status?: string;
  error?: string;
  propertyId?: string;
  unitId?: string;
}): Promise<IDocument> {
  const status = normalizeStatus(params.status);
  const doc = await DocumentModel.create({
    docId: params.fileKey,
    orgId: new mongoose.Types.ObjectId(params.orgId),
    uploaderUserId: new mongoose.Types.ObjectId(params.uploaderUserId),
    fileKey: params.fileKey,
    type: params.type,
    status,
    ...(status === DocumentStatus.FAILED && params.error != null && { error: params.error }),
    ...(params.propertyId && { propertyId: new mongoose.Types.ObjectId(params.propertyId) }),
    ...(params.unitId && { unitId: new mongoose.Types.ObjectId(params.unitId) }),
  });
  return doc.toObject() as IDocument;
}

export async function updateDocumentStatus(params: {
  fileKey: string;
  status: DocumentStatusType;
  error?: string;
}): Promise<IDocument | null> {
  const update: Record<string, unknown> =
    params.status === DocumentStatus.FAILED && params.error != null
      ? { status: params.status, error: params.error }
      : { status: params.status, $unset: { error: 1 } };
  const doc = await DocumentModel.findOneAndUpdate(
    { fileKey: params.fileKey },
    update,
    { new: true, runValidators: true }
  )
    .lean()
    .exec();
  return doc as IDocument | null;
}

export async function listDocuments(params: {
  orgId: string;
  status?: string;
  type?: string;
  propertyId?: string;
  unitId?: string;
  limit: number;
  cursor?: string;
}): Promise<{ docs: IDocument[]; nextCursor: string | null }> {
  const filter: mongoose.FilterQuery<IDocument> = { orgId: new mongoose.Types.ObjectId(params.orgId) };
  if (params.status) filter.status = params.status;
  if (params.type) filter.type = params.type;
  if (params.propertyId) filter.propertyId = new mongoose.Types.ObjectId(params.propertyId);
  if (params.unitId) filter.unitId = new mongoose.Types.ObjectId(params.unitId);
  if (params.cursor && mongoose.Types.ObjectId.isValid(params.cursor)) {
    filter._id = { $gt: new mongoose.Types.ObjectId(params.cursor) };
  }

  const limit = Math.min(Math.max(1, params.limit), 100);
  const docs = await DocumentModel.find(filter)
    .sort({ _id: 1 })
    .limit(limit + 1)
    .lean();

  const hasMore = docs.length > limit;
  const page = hasMore ? docs.slice(0, limit) : docs;
  const nextCursor = hasMore && page.length > 0 ? (page[page.length - 1] as any)._id.toString() : null;

  return {
    docs: page as IDocument[],
    nextCursor,
  };
}
