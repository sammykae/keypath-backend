import { Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import { PropertyFinancingModel } from '../../properties/models/propertyFinancing.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { resolveLandlordOrgId } from '../services/landlordDashboard.service';

const CreateFinancingSchema = z.object({
  lenderName: z.string().optional(),
  principal: z.number().positive(),
  outstandingBalance: z.number().min(0),
  interestRate: z.number().min(0).optional(),
  maturityDate: z.coerce.date(),
  type: z.enum(['MORTGAGE', 'LOAN', 'LINE_OF_CREDIT', 'OTHER']).default('MORTGAGE'),
});

async function verifyPropertyOwnership(userId: mongoose.Types.ObjectId, propertyId: string): Promise<string> {
  const orgId = await resolveLandlordOrgId(userId);
  const property = await PropertyModel.findOne({
    _id: new mongoose.Types.ObjectId(propertyId),
    orgId: new mongoose.Types.ObjectId(orgId),
  }).lean();
  if (!property) throw new AppError('Property not found', 404);
  return orgId;
}

export async function listFinancingHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required'); return; }
    const { propertyId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(propertyId)) { errorResponse(res, 400, 'INVALID_ID', 'Invalid property ID'); return; }
    const orgId = await verifyPropertyOwnership(req.auth._id as any, propertyId);
    const items = await PropertyFinancingModel.find({
      orgId: new mongoose.Types.ObjectId(orgId),
      propertyId: new mongoose.Types.ObjectId(propertyId),
    }).sort({ maturityDate: 1 }).lean();
    successResponse(res, { financing: items.map(f => ({
      id: (f as any)._id.toString(),
      propertyId: (f as any).propertyId.toString(),
      lenderName: (f as any).lenderName ?? null,
      principal: f.principal,
      outstandingBalance: f.outstandingBalance,
      interestRate: f.interestRate ?? null,
      maturityDate: (f as any).maturityDate.toISOString(),
      type: f.type,
    })) });
  } catch (err: any) {
    if (err instanceof AppError) { errorResponse(res, err.statusCode, 'FINANCING_ERROR', err.message); return; }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to list financing records');
  }
}

export async function createFinancingHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required'); return; }
    const { propertyId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(propertyId)) { errorResponse(res, 400, 'INVALID_ID', 'Invalid property ID'); return; }
    const orgId = await verifyPropertyOwnership(req.auth._id as any, propertyId);
    const body = CreateFinancingSchema.parse(req.body);
    const doc = await PropertyFinancingModel.create({
      orgId: new mongoose.Types.ObjectId(orgId),
      propertyId: new mongoose.Types.ObjectId(propertyId),
      ...body,
    });
    successResponse(res, { id: doc._id.toString() }, 201);
  } catch (err: any) {
    if (err instanceof AppError) { errorResponse(res, err.statusCode, 'FINANCING_ERROR', err.message); return; }
    if (err?.name === 'ZodError') { errorResponse(res, 400, 'VALIDATION_ERROR', 'Validation error', err.issues); return; }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to create financing record');
  }
}

export async function deleteFinancingHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required'); return; }
    const { propertyId, financingId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(propertyId) || !mongoose.Types.ObjectId.isValid(financingId)) {
      errorResponse(res, 400, 'INVALID_ID', 'Invalid ID'); return;
    }
    const orgId = await verifyPropertyOwnership(req.auth._id as any, propertyId);
    const deleted = await PropertyFinancingModel.findOneAndDelete({
      _id: new mongoose.Types.ObjectId(financingId),
      orgId: new mongoose.Types.ObjectId(orgId),
      propertyId: new mongoose.Types.ObjectId(propertyId),
    });
    if (!deleted) { errorResponse(res, 404, 'NOT_FOUND', 'Financing record not found'); return; }
    successResponse(res, { deleted: true });
  } catch (err: any) {
    if (err instanceof AppError) { errorResponse(res, err.statusCode, 'FINANCING_ERROR', err.message); return; }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to delete financing record');
  }
}
