import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { z, ZodError } from 'zod';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import {
  registerIndependentPM,
  confirmIndependentAuthority,
  createIndependentProperty,
} from '../services/independentPropertyManager.service';

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(30).optional(),
  companyName: z.string().min(1).max(200),
  companyAddress: z.string().max(500).optional(),
  website: z.string().max(300).optional(),
  propertiesManaged: z.number().int().min(0).optional(),
});

const CreatePropertySchema = z.object({
  name: z.string().min(1).max(200),
  address: z.object({
    line1: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    postalCode: z.string().min(1),
    country: z.string().optional(),
  }),
  type: z.enum(['SFR', 'MF', 'BTR', 'Condo', 'Other']),
  totalUnits: z.number().int().min(1).optional(),
  yearBuilt: z.number().int().min(1800).optional(),
});

function handleError(res: Response, err: unknown, fallback: string): void {
  if (err instanceof ZodError) {
    errorResponse(res, 400, 'VALIDATION_ERROR', err.issues[0]?.message ?? 'Validation error');
    return;
  }
  if (err instanceof AppError) {
    errorResponse(res, err.statusCode, 'APP_ERROR', err.message);
    return;
  }
  errorResponse(res, 500, 'INTERNAL_ERROR', fallback);
}

/** POST /api/property-manager/independent/register — public, no auth required */
export async function registerIndependentPMHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = RegisterSchema.parse(req.body);
    const result = await registerIndependentPM(body);
    successResponse(res, result, 201);
  } catch (err) {
    handleError(res, err, 'Failed to register');
  }
}

/** POST /api/property-manager/independent/confirm-authority */
export async function confirmIndependentAuthorityHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const result = await confirmIndependentAuthority(new mongoose.Types.ObjectId(req.auth._id.toString()));
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to confirm authority');
  }
}

/** POST /api/property-manager/independent/properties */
export async function createIndependentPropertyHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const body = CreatePropertySchema.parse(req.body);
    const result = await createIndependentProperty(new mongoose.Types.ObjectId(req.auth._id.toString()), body);
    successResponse(res, result, 201);
  } catch (err) {
    handleError(res, err, 'Failed to create property');
  }
}
