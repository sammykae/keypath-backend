import { Response } from 'express';
import mongoose from 'mongoose';
import { z, ZodError } from 'zod';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import {
  resolveProgramConfig,
  upsertProgramConfig,
  listProgramConfigs,
  deleteProgramConfig,
} from '../services/programConfig.service';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const RewardRulesSchema = z.object({
  enabled: z.boolean().nullish(),
  onTimeRentPoints: z.number().min(0).nullish(),
  renewalPoints: z.number().min(0).nullish(),
  maintenanceReportPoints: z.number().min(0).nullish(),
  monthlyPointsCap: z.number().min(0).nullish(),
}).strict();

const TokenRulesSchema = z.object({
  enabled: z.boolean().nullish(),
  monthlyAccrualTokens: z.number().min(0).nullish(),
  vestingMonths: z.number().int().min(0).nullish(),
  tokenValueUsd: z.number().min(0).nullish(),
}).strict();

const UpsertSchema = z.object({
  scope: z.enum(['ORG', 'PROPERTY', 'UNIT', 'TENANT']),
  propertyId: objectId.optional(),
  unitId: objectId.optional(),
  tenancyId: objectId.optional(),
  programType: z.enum(['NONE', 'RPA_ONLY', 'TEPA_ONLY', 'BOTH']).nullish(),
  rewardRules: RewardRulesSchema.nullish(),
  tokenRules: TokenRulesSchema.nullish(),
  effectiveDate: z.string().datetime().nullish(),
}).refine(
  (d) =>
    (d.scope === 'ORG') ||
    (d.scope === 'PROPERTY' && d.propertyId) ||
    (d.scope === 'UNIT' && d.unitId) ||
    (d.scope === 'TENANT' && d.tenancyId),
  { message: 'Provide the id matching the scope (propertyId / unitId / tenancyId)' }
);

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

/** GET /api/landlord/program-config/resolve?propertyId=|unitId=|tenancyId= */
export async function resolveConfigHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const { propertyId, unitId, tenancyId } = req.query as Record<string, string | undefined>;
    const resolved = await resolveProgramConfig({ propertyId, unitId, tenancyId });
    successResponse(res, { config: resolved });
  } catch (err) {
    handleError(res, err, 'Failed to resolve program config');
  }
}

/** GET /api/landlord/program-config?propertyId= */
export async function listConfigsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const configs = await listProgramConfigs(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      { propertyId: (req.query.propertyId as string) || undefined }
    );
    successResponse(res, { configs });
  } catch (err) {
    handleError(res, err, 'Failed to list program configs');
  }
}

/** PUT /api/landlord/program-config */
export async function upsertConfigHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const body = UpsertSchema.parse(req.body);
    const config = await upsertProgramConfig(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      body as any
    );
    successResponse(res, { config });
  } catch (err) {
    handleError(res, err, 'Failed to save program config');
  }
}

/** DELETE /api/landlord/program-config/:configId */
export async function deleteConfigHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    await deleteProgramConfig(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      req.params.configId
    );
    successResponse(res, { deleted: true });
  } catch (err) {
    handleError(res, err, 'Failed to delete program config');
  }
}
