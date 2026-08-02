import { Response } from 'express';
import mongoose from 'mongoose';
import { z, ZodError } from 'zod';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import {
  assignPropertyManager,
  listPropertyManagerAssignments,
  revokePropertyManager,
  updateAssignmentPermissions,
  listMyAssignments,
  listTenantContactsForPM,
  hasPMAccess,
} from '../services/propertyManager.service';
import {
  getPMInviteStatusForAssignment,
  resendPMInvite,
  revokePMInvite,
} from '../services/propertyManagerInvite.service';
import { PM_PERMISSIONS } from '../models/propertyManagerAssignment.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import {
  listNotesForPropertyManager,
  createNoteAsPropertyManager,
} from '../../notes/services/notes.service';

const CreateNoteAsPMSchema = z.object({
  unitId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  tenantId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  noteType: z.enum(['PROPERTY', 'TENANT', 'MAINTENANCE', 'RENEWAL', 'PAYMENT', 'COMPLIANCE']),
  noteText: z.string().min(1).max(5000),
  attachments: z.array(z.object({
    fileKey: z.string().min(1),
    fileName: z.string().min(1),
    fileType: z.string().min(1),
  })).max(10).default([]),
});

const AssignSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  propertyId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid propertyId'),
  permissions: z.array(z.enum(PM_PERMISSIONS as [string, ...string[]])).optional(),
});

const UpdatePermissionsSchema = z.object({
  permissions: z.array(z.enum(PM_PERMISSIONS as [string, ...string[]])).optional(),
  unitIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/)).nullable().optional(),
  allowGroupChat: z.boolean().optional(),
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

/** POST /api/landlord/property-managers */
export async function assignPropertyManagerHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const body = AssignSchema.parse(req.body);
    const result = await assignPropertyManager(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      body as any
    );
    successResponse(res, { assignment: result }, 201);
  } catch (err) {
    handleError(res, err, 'Failed to assign property manager');
  }
}

/** GET /api/landlord/property-managers?propertyId= */
export async function listPropertyManagerAssignmentsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const assignments = await listPropertyManagerAssignments(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      { propertyId: (req.query.propertyId as string) || undefined }
    );
    successResponse(res, { assignments });
  } catch (err) {
    handleError(res, err, 'Failed to list property managers');
  }
}

/** DELETE /api/landlord/property-managers/:assignmentId */
export async function revokePropertyManagerHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    await revokePropertyManager(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      req.params.assignmentId
    );
    successResponse(res, { revoked: true });
  } catch (err) {
    handleError(res, err, 'Failed to revoke property manager');
  }
}

/** PATCH /api/landlord/property-managers/:assignmentId/permissions */
export async function updateAssignmentPermissionsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const body = UpdatePermissionsSchema.parse(req.body);
    const result = await updateAssignmentPermissions(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      req.params.assignmentId,
      body as any
    );
    successResponse(res, { assignment: result });
  } catch (err) {
    handleError(res, err, 'Failed to update permissions');
  }
}

/** GET /api/landlord/property-managers/:assignmentId/invite */
export async function getPMInviteStatusHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const result = await getPMInviteStatusForAssignment(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      req.params.assignmentId
    );
    successResponse(res, { invite: result });
  } catch (err) {
    handleError(res, err, 'Failed to get invite status');
  }
}

/** POST /api/landlord/property-managers/:assignmentId/invite/resend */
export async function resendPMInviteHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const result = await resendPMInvite(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      req.params.assignmentId
    );
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to resend invite');
  }
}

/** POST /api/landlord/property-managers/:assignmentId/invite/revoke */
export async function revokePMInviteHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const result = await revokePMInvite(
      new mongoose.Types.ObjectId(req.auth._id.toString()),
      req.params.assignmentId
    );
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to revoke invite');
  }
}

/** GET /api/property-manager/my-properties */
export async function listMyAssignmentsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const assignments = await listMyAssignments(new mongoose.Types.ObjectId(req.auth._id.toString()));
    successResponse(res, { assignments });
  } catch (err) {
    handleError(res, err, 'Failed to list your assigned properties');
  }
}

/** GET /api/property-manager/tenant-contacts */
export async function listTenantContactsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const contacts = await listTenantContactsForPM(new mongoose.Types.ObjectId(req.auth._id.toString()));
    successResponse(res, { contacts });
  } catch (err) {
    handleError(res, err, 'Failed to list tenant contacts');
  }
}

/** GET /api/property-manager/properties/:propertyId/notes */
export async function listNotesForPMHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const pmUserId = new mongoose.Types.ObjectId(req.auth._id.toString());
    const { propertyId } = req.params;
    const allowed = await hasPMAccess(pmUserId, propertyId);
    if (!allowed) { errorResponse(res, 403, 'FORBIDDEN', 'You are not assigned to this property'); return; }

    const property = await PropertyModel.findById(propertyId).select('orgId').lean();
    if (!property) { errorResponse(res, 404, 'NOT_FOUND', 'Property not found'); return; }

    const notes = await listNotesForPropertyManager(propertyId, (property as any).orgId);
    successResponse(res, { notes });
  } catch (err) {
    handleError(res, err, 'Failed to list notes');
  }
}

/** POST /api/property-manager/properties/:propertyId/notes */
export async function createNoteAsPMHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const pmUserId = new mongoose.Types.ObjectId(req.auth._id.toString());
    const { propertyId } = req.params;
    const allowed = await hasPMAccess(pmUserId, propertyId, 'UPLOAD_NOTES');
    if (!allowed) { errorResponse(res, 403, 'FORBIDDEN', 'You do not have note permission on this property'); return; }

    const property = await PropertyModel.findById(propertyId).select('orgId').lean();
    if (!property) { errorResponse(res, 404, 'NOT_FOUND', 'Property not found'); return; }

    const body = CreateNoteAsPMSchema.parse(req.body);
    const note = await createNoteAsPropertyManager(pmUserId, (property as any).orgId, {
      propertyId,
      ...body,
    });
    successResponse(res, { note }, 201);
  } catch (err) {
    handleError(res, err, 'Failed to create note');
  }
}
