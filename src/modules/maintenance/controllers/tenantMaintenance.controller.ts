import { Response } from 'express';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { SubmitMaintenanceSchema } from '../dto/maintenance.dto';
import { getTenantMaintenanceTickets, submitMaintenanceTicket } from '../services/tenantMaintenance.service';
import { AppError } from '../../../core/errors/AppError';
import { ZodError } from 'zod';

export async function getMaintenanceTicketsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const tenancyId = typeof req.query.tenancyId === 'string' ? req.query.tenancyId : undefined;
    const tickets = await getTenantMaintenanceTickets(req.auth._id.toString(), tenancyId);
    successResponse(res, { tickets });
  } catch (e) {
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to fetch maintenance tickets');
  }
}

export async function submitMaintenanceTicketHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const body = SubmitMaintenanceSchema.parse(req.body);
    const ticket = await submitMaintenanceTicket(req.auth._id.toString(), body);
    successResponse(res, { ticket }, 201);
  } catch (err: any) {
    if (err instanceof ZodError) { errorResponse(res, 400, 'VALIDATION_ERROR', err.issues[0]?.message ?? 'Validation error'); return; }
    if (err instanceof AppError) { errorResponse(res, err.statusCode, 'APP_ERROR', err.message); return; }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to submit maintenance request');
  }
}
