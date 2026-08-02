import { Response } from 'express';
import { z, ZodError } from 'zod';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { getLandlordMaintenanceTickets, updateMaintenanceTicket } from '../services/landlordMaintenance.service';
import { AppError } from '../../../core/errors/AppError';

const AttachmentSchema = z.object({
  fileKey: z.string().min(1),
  fileName: z.string().min(1),
  fileType: z.string().min(1),
});

const UpdateTicketSchema = z.object({
  status: z.enum(['OPEN', 'UNDER_REVIEW', 'IN_PROGRESS', 'RESOLVED', 'REJECTED', 'CLOSED']).optional(),
  creditsToAward: z.number().min(0).optional(),
  note: z.string().max(500).optional(),
  rewardEligible: z.boolean().optional(),
  rewardDecision: z.enum(['PENDING', 'APPROVED', 'DENIED']).optional(),
  attachments: z.array(AttachmentSchema).max(10).optional(),
});

export async function getLandlordMaintenanceHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const tickets = await getLandlordMaintenanceTickets(req.auth._id.toString(), status);
    successResponse(res, { tickets });
  } catch (err: any) {
    if (err instanceof AppError) { errorResponse(res, err.statusCode, 'APP_ERROR', err.message); return; }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to fetch maintenance tickets');
  }
}

export async function updateMaintenanceTicketHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const body = UpdateTicketSchema.parse(req.body);
    const ticket = await updateMaintenanceTicket(req.auth._id.toString(), req.params.ticketId, body);
    successResponse(res, { ticket });
  } catch (err: any) {
    if (err instanceof ZodError) { errorResponse(res, 400, 'VALIDATION_ERROR', err.issues[0]?.message ?? 'Validation error'); return; }
    if (err instanceof AppError) { errorResponse(res, err.statusCode, 'APP_ERROR', err.message); return; }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to update ticket');
  }
}
