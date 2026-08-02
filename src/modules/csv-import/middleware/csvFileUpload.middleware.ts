import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { errorResponse } from '../../../core/utils/response';

const MAX = 20 * 1024 * 1024;

const storage = multer.memoryStorage();

/** In-memory `file` field; mimetype is not enforced (clients vary); validation is done by the engine. */
export const csvFileUpload = multer({
  storage,
  limits: { fileSize: MAX },
}).single('file');

export function isMultipartRequest(req: { get(name: string): string | undefined }): boolean {
  return (req.get('content-type') || '').toLowerCase().includes('multipart/form-data');
}

/**
 * Run multer for multipart; map common upload errors to 400 instead of 500.
 */
export function csvFileUploadIfMultipart(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!isMultipartRequest(req)) {
    next();
    return;
  }
  csvFileUpload(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    const code = (err as { code?: string }).code;
    if (code === 'LIMIT_FILE_SIZE') {
      errorResponse(
        res,
        400,
        'FILE_TOO_LARGE',
        `Upload exceeds maximum size (${Math.floor(MAX / (1024 * 1024))}MB)`
      );
      return;
    }
    if (code === 'LIMIT_PART_COUNT' || code === 'LIMIT_UNEXPECTED_FILE') {
      errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid multipart form');
      return;
    }
    next(err);
  });
}
