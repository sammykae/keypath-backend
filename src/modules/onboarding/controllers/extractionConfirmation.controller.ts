import mongoose from 'mongoose';
import { Request, Response } from 'express';
import {
  upsertExtractionFields,
  recordManualOverride,
  confirmFields,
  getFieldsForScope,
  getUnconfirmedAiFields,
} from '../services/extractionConfirmation.service';
import type { ExtractionFieldDTO } from '../types/extractionConfirmation.types';
import { successResponse, errorResponse } from '../../../core/utils/response';

function userIdFromReq(req: Request): mongoose.Types.ObjectId {
  const user = req.user as { _id: string };
  return new mongoose.Types.ObjectId(user._id);
}

export async function upsertExtractionFieldsHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user as { _id: string };
    if (!user?._id) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const { scope, fields } = req.body as { scope: string; fields: ExtractionFieldDTO[] };
    const result = await upsertExtractionFields(userIdFromReq(req), scope, fields);
    successResponse(res, result);
  } catch (err) {
    console.error('Upsert extraction fields error:', err);
    errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to upsert extraction fields');
  }
}

export async function recordOverrideHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user as { _id: string };
    if (!user?._id) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const { scope, fieldKey, value } = req.body as { scope: string; fieldKey: string; value: unknown };
    const uid = userIdFromReq(req);
    const result = await recordManualOverride(uid, scope, fieldKey, value, uid);
    successResponse(res, result);
  } catch (err) {
    console.error('Record override error:', err);
    errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to record manual override');
  }
}

export async function confirmFieldsHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user as { _id: string };
    if (!user?._id) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const { scope, fieldKeys } = req.body as { scope: string; fieldKeys: string[] };
    const uid = userIdFromReq(req);
    const result = await confirmFields(uid, scope, fieldKeys, uid);
    successResponse(res, result);
  } catch (err) {
    console.error('Confirm fields error:', err);
    errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to confirm fields');
  }
}

export async function getFieldsHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user as { _id: string };
    if (!user?._id) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const scope = req.query.scope as string;
    const result = await getFieldsForScope(userIdFromReq(req), scope);
    successResponse(res, result);
  } catch (err) {
    console.error('Get extraction fields error:', err);
    errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to get extraction fields');
  }
}

export async function getUnconfirmedHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user as { _id: string };
    if (!user?._id) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const scope = req.query.scope as string | undefined;
    const fields = await getUnconfirmedAiFields(userIdFromReq(req), scope);
    successResponse(res, { fields, count: fields.length });
  } catch (err) {
    console.error('Get unconfirmed AI fields error:', err);
    errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to get unconfirmed fields');
  }
}
