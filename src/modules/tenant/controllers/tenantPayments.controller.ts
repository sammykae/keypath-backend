import { Response } from 'express';
import { getTenantPayments } from '../../payments/services/tenantPayments.service';
import { TenantPaymentsQuerySchema } from '../dto/payments.dto';
import { AppError } from '../../../core/errors/AppError';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { ZodError } from 'zod';

/**
 * GET /tenant/payments — TENANT only. List payments for the tenant (BE-104).
 */
export async function getTenantPaymentsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.auth?._id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const query = TenantPaymentsQuerySchema.parse({ range: req.query.range });
    const result = await getTenantPayments(req.auth._id as any, query.range);
    res.status(200).json(result);
  } catch (err: any) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.issues });
      return;
    }
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error('Unexpected error in get tenant payments:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
