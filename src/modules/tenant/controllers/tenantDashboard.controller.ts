import { Response } from 'express';
import { getTenantDashboard } from '../services/tenantDashboard.service';
import { TenantDashboardQuerySchema } from '../dto/dashboard.dto';
import { AppError } from '../../../core/errors/AppError';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { ZodError } from 'zod';

/**
 * GET /tenant/dashboard — TENANT only. Returns dashboard summary with credits, next payment, activity series.
 * Works when tenant has no activity (empty series) or no unit assigned (friendly unassigned structure).
 */
export async function getTenantDashboardHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.auth?._id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const query = TenantDashboardQuerySchema.parse({
      range: req.query.range,
    });
    const result = await getTenantDashboard(req.auth._id as any, query.range);
    res.status(200).json(result);
  } catch (err: any) {
    if (err instanceof ZodError) {
      const message = err.issues.map((e) => e.message).join('; ') || 'Validation error';
      res.status(400).json({ error: message });
      return;
    }
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error('Unexpected error in get tenant dashboard:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
