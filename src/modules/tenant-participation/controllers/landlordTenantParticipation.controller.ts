import { Response } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { AppError } from '../../../core/errors/AppError';
import {
  UpsertTenantParticipationBodySchema,
  TenancyIdQuerySchema,
} from '../dto/tenantParticipation.dto';
import {
  getTenantParticipationForLandlord,
  upsertTenantParticipationForLandlord,
} from '../services/tenantParticipation.service';

function orgIdFromRequest(req: AuthenticatedRequest): string | null | undefined {
  const raw = req.query.orgId ?? req.headers['x-org-id'];
  return (Array.isArray(raw) ? raw[0] : raw) as string | null | undefined;
}

export async function upsertLandlordTenantParticipationHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.auth?._id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const body = UpsertTenantParticipationBodySchema.parse(req.body);
    const result = await upsertTenantParticipationForLandlord(
      userId as mongoose.Types.ObjectId,
      orgIdFromRequest(req),
      body
    );
    if (res.headersSent) return;
    const payload = { tenantParticipation: result };
    try {
      res.status(200).type('application/json').send(JSON.stringify(payload));
    } catch (serializeErr) {
      console.error('tenant-participation PUT JSON serialize:', serializeErr);
      res.status(500).type('application/json').send(JSON.stringify({ error: 'Response serialization failed' }));
    }
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
    console.error('upsertLandlordTenantParticipationHandler:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getLandlordTenantParticipationHandler(
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
    const result = await getTenantParticipationForLandlord(
      userId as mongoose.Types.ObjectId,
      orgIdFromRequest(req),
      tenancyId
    );
    if (res.headersSent) return;
    const payload = { tenantParticipation: result };
    try {
      res.status(200).type('application/json').send(JSON.stringify(payload));
    } catch (serializeErr) {
      console.error('tenant-participation GET JSON serialize:', serializeErr);
      res.status(500).type('application/json').send(JSON.stringify({ error: 'Response serialization failed' }));
    }
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
    console.error('getLandlordTenantParticipationHandler:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
