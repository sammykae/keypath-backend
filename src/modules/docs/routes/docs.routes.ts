import path from 'path';
import fs from 'fs';
import { Router, Request, Response, RequestHandler } from 'express';
import { authMiddleware } from '../../../middleware/authMiddleware';
import { uploadUrlHandler, completeDocHandler, listDocsHandler } from '../controllers/docs.controller';
import { resolveOrgIdForUser } from '../../chat/services/participantRules.service';
import { uploadSingle } from '../middleware/upload.middleware';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { storage } from '../storage';

const router = Router();

const LOCAL_UPLOAD_DIR = process.env.LOCAL_UPLOAD_DIR || path.join(process.cwd(), 'uploads');

/**
 * @swagger
 * /api/docs/upload-url:
 *   post:
 *     tags: [Documents]
 *     summary: Upload file and get fileKey + public URL
 *     description: Send file as multipart (field "file"). Server uploads to S3 (production) or local disk (local). Returns fileKey and publicUrl. No signed URLs; bucket is public. Then call POST /docs/complete with fileKey and metadata.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: fileKey and publicUrl
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     fileKey: { type: string }
 *                     publicUrl: { type: string }
 *       400:
 *         description: Validation error, missing file, or user has no organization
 *       401:
 *         description: Unauthorized
 */
router.post('/upload-url', authMiddleware, uploadSingle, uploadUrlHandler);

// GET /api/docs/presigned-url?key=docs/orgId/file.pdf  — returns a 15-min signed S3 URL (landlord/admin only)
router.get('/presigned-url', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const auth = (req as any).auth;
  const role = auth?.role?.toLowerCase();
  if (role !== 'landlord' && role !== 'admin') {
    res.status(403).json({ success: false, error: 'Forbidden' });
    return;
  }
  const key = req.query.key as string;
  if (!key) {
    res.status(400).json({ success: false, error: 'key is required' });
    return;
  }

  // Previously any landlord could fetch any other org's document by key —
  // the key embeds the owning orgId as its second path segment (docs/<orgId>/...),
  // so verify it matches the caller's own org unless they're an admin.
  if (role !== 'admin') {
    const keyOrgId = key.split('/')[1];
    const callerOrgId = await resolveOrgIdForUser(auth._id.toString());
    if (!keyOrgId || !callerOrgId || keyOrgId !== callerOrgId.toString()) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }
  }

  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION || 'us-east-1';
  if (!bucket) {
    res.status(500).json({ success: false, error: 'S3 not configured' });
    return;
  }
  try {
    const client = new S3Client({ region });
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const url = await getSignedUrl(client, command, { expiresIn: 900 }); // 15 min
    res.json({ success: true, url });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to generate signed URL' });
  }
});

const serveFileHandler: RequestHandler = async (req: Request, res: Response): Promise<void> => {
  const rawKey = (req.params as any)[0] ?? '';
  if (!rawKey) {
    res.status(400).json({ success: false, error: 'Invalid path' });
    return;
  }
  let fileKey: string;
  try {
    fileKey = decodeURIComponent(rawKey);
  } catch {
    res.status(400).json({ success: false, error: 'Invalid path' });
    return;
  }

  const useS3 = !!process.env.AWS_S3_BUCKET && process.env.USE_LOCAL_STORAGE !== 'true';

  if (useS3) {
    // Proxy from S3 using server credentials — bucket stays private
    try {
      const buffer = await storage.get(fileKey);
      if (!buffer) {
        res.status(404).json({ success: false, error: 'Not found' });
        return;
      }
      const ext = fileKey.split('.').pop()?.toLowerCase() ?? '';
      const mimeMap: Record<string, string> = {
        pdf: 'application/pdf',
        jpg: 'image/jpeg', jpeg: 'image/jpeg',
        png: 'image/png', gif: 'image/gif', webp: 'image/webp',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
      const contentType = mimeMap[ext] ?? 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${fileKey.split('/').pop()}"`);
      res.send(buffer);
    } catch (err: any) {
      console.error('[S3 proxy error]', fileKey, err?.message ?? err);
      res.status(500).json({ success: false, error: 'Failed to fetch file', detail: err?.message });
    }
    return;
  }

  // Local storage fallback
  const normalized = path.normalize(fileKey).replace(/^(\.\.(\/|\\))+/, '');
  const resolvedPath = path.resolve(LOCAL_UPLOAD_DIR, normalized);
  const uploadDirResolved = path.resolve(LOCAL_UPLOAD_DIR);
  if (!resolvedPath.startsWith(uploadDirResolved)) {
    res.status(400).json({ success: false, error: 'Invalid path' });
    return;
  }
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
    res.status(404).json({ success: false, error: 'Not found' });
    return;
  }
  res.sendFile(resolvedPath);
};
// Previously mounted with no auth middleware at all — fully public, unauthenticated
// file access to any uploaded document (leases, RPA/TEPA agreements, compliance
// docs, maintenance photos) for anyone who obtained a fileKey by any means.
router.get(/^\/files\/(.+)$/, authMiddleware, serveFileHandler);

/**
 * @swagger
 * /api/docs/complete:
 *   post:
 *     tags: [Documents]
 *     summary: Register document metadata
 *     description: Call after uploading the file via POST /docs/upload-url. Registers the document with fileKey and metadata.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fileKey, type, status]
 *             properties:
 *               fileKey: { type: string }
 *               type: { type: string }
 *               status: { type: string }
 *               propertyId: { type: string }
 *               unitId: { type: string }
 *     responses:
 *       201:
 *         description: Document registered
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     orgId: { type: string }
 *                     uploaderUserId: { type: string }
 *                     fileKey: { type: string }
 *                     type: { type: string }
 *                     status: { type: string }
 *                     propertyId: { type: string, nullable: true }
 *                     unitId: { type: string, nullable: true }
 *                     createdAt: { type: string, format: date-time }
 *       400:
 *         description: Validation error or user has no organization
 *       401:
 *         description: Unauthorized
 */
router.post('/complete', authMiddleware, completeDocHandler);

/**
 * @swagger
 * /api/docs:
 *   get:
 *     tags: [Documents]
 *     summary: List documents
 *     description: List documents for the user's organization with optional filters.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *       - in: query
 *         name: propertyId
 *         schema: { type: string }
 *       - in: query
 *         name: unitId
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: docs and nextCursor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     docs:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: string }
 *                           orgId: { type: string }
 *                           uploaderUserId: { type: string }
 *                           fileKey: { type: string }
 *                           type: { type: string }
 *                           status: { type: string }
 *                           propertyId: { type: string, nullable: true }
 *                           unitId: { type: string, nullable: true }
 *                           createdAt: { type: string, format: date-time }
 *                     nextCursor: { type: string, nullable: true }
 *       400:
 *         description: Validation error or user has no organization
 *       401:
 *         description: Unauthorized
 */
router.get('/', authMiddleware, listDocsHandler);

export default router;
