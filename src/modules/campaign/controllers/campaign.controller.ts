import { Response } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import {
  requireLandlordOrgAccess,
  resolveLandlordOrgId,
} from '../../landlord/services/landlordDashboard.service';
import { AppError } from '../../../core/errors/AppError';
import {
  CreateCampaignSchema,
  ListCampaignsQuerySchema,
  UpdateCampaignSchema,
} from '../dto/campaign.dto';
import { createCampaign, listCampaigns, updateCampaign } from '../services/campaign.service';
import { successResponse, errorResponse } from '../../../core/utils/response';

export async function createCampaignHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const body = CreateCampaignSchema.parse(req.body);
    await requireLandlordOrgAccess(req.auth._id as mongoose.Types.ObjectId, body.orgId);
    const { orgId, ...payload } = body;
    const item = await createCampaign(orgId, payload, req.auth._id as mongoose.Types.ObjectId);
    successResponse(res, { campaign: item }, 201);
  } catch (err: any) {
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'CAMPAIGN_ERROR', err.message);
      return;
    }
    if (err instanceof ZodError) {
      errorResponse(res, 400, 'VALIDATION_ERROR', 'Validation error', err.issues);
      return;
    }
    console.error('createCampaignHandler', err);
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
}

export async function listCampaignsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    let orgId: string;
    if (req.query.orgId && typeof req.query.orgId === 'string') {
      await requireLandlordOrgAccess(req.auth._id as mongoose.Types.ObjectId, req.query.orgId);
      orgId = req.query.orgId;
    } else {
      orgId = await resolveLandlordOrgId(req.auth._id as mongoose.Types.ObjectId);
    }
    const items = await listCampaigns(orgId);
    successResponse(res, { campaigns: items });
  } catch (err: any) {
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'CAMPAIGN_ERROR', err.message);
      return;
    }
    if (err instanceof ZodError) {
      errorResponse(res, 400, 'VALIDATION_ERROR', 'Validation error', err.issues);
      return;
    }
    console.error('listCampaignsHandler', err);
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
}

export async function updateCampaignHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'Campaign id required' });
      return;
    }
    const body = UpdateCampaignSchema.parse(req.body);
    await requireLandlordOrgAccess(req.auth._id as mongoose.Types.ObjectId, body.orgId);
    const { orgId, ...patch } = body;
    const item = await updateCampaign(orgId, id, patch);
    successResponse(res, { campaign: item });
  } catch (err: any) {
    if (err instanceof AppError) {
      errorResponse(res, err.statusCode, 'CAMPAIGN_ERROR', err.message);
      return;
    }
    if (err instanceof ZodError) {
      errorResponse(res, 400, 'VALIDATION_ERROR', 'Validation error', err.issues);
      return;
    }
    console.error('updateCampaignHandler', err);
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
}
