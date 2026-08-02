// src/core/utils/response.ts
import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

export interface ApiResponse<T = any> {
  success: boolean;
  requestId: string;
  data: T | null;
  error: { code: string; message: string; details?: any } | null;
}

export function successResponse<T>(res: Response, data: T, status = 200): void {
  const requestId = (res.locals.requestId as string) || uuidv4();
  res.status(status).json({
    success: true,
    requestId,
    data,
    error: null,
  });
}

export function errorResponse(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: any
): void {
  const requestId = (res.locals.requestId as string) || uuidv4();
  res.status(status).json({
    success: false,
    requestId,
    data: null,
    error: { code, message, details },
  });
}