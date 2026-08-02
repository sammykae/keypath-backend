import { Response } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { AppError } from '../../../core/errors/AppError';
import { TenancyIdQuerySchema } from '../dto/tenantParticipation.dto';
import { getTenantParticipationForTenant } from '../services/tenantParticipation.service';

export async function getTenantSelfParticipationHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.auth?._id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { tenancyId } = TenancyIdQuerySchema.parse(req.query);
    const result = await getTenantParticipationForTenant(
      userId as mongoose.Types.ObjectId,
      tenancyId
    );
    res.status(200).json({ tenantParticipation: result });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      const message = err.issues.map((e) => e.message).join('; ') || 'Validation error';
      res.status(400).json({ error: message });
      return;
    }
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error('getTenantSelfParticipationHandler:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
