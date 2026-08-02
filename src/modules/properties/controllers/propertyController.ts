import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { writeAuditEvent } from '../../audit/services/audit.service';
import { Membership } from '../../orgs/models/membership.model';
import {
  createProperty,
  allProperties,
  getPropertyTree,
  updateProperty,
  deleteProperty,
} from '../services/propertyServices';
import { PropertyCreateDTO, PropertyCreateSchema, UpdatePropertyDTO } from '../dto/propertyDTO';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';

type AuthContext = NonNullable<AuthenticatedRequest['auth']>;

const toObjectId = (value: unknown) =>
  value instanceof mongoose.Types.ObjectId
    ? value
    : new mongoose.Types.ObjectId(String(value));

const writePropertyAuditEvents = async ({
  auth,
  orgId,
  propertyId,
  action,
  diff,
  metadata,
}: {
  auth?: AuthContext;
  orgId?: unknown;
  propertyId?: unknown;
  action: 'CREATED' | 'UPDATED' | 'DELETED';
  diff?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) => {
  if (!auth?._id || !orgId || !propertyId) return;

  const actorUserId = toObjectId(auth._id);
  const orgObjectId = toObjectId(orgId);
  const propertyObjectId = toObjectId(propertyId);

  await writeAuditEvent({
    actorUserId,
    orgId: orgObjectId,
    action: `PROPERTY_${action}`,
    entityType: 'PROPERTY',
    entityId: propertyObjectId,
    propertyId: propertyObjectId,
    diff,
  });

  await writeAuditEvent({
    actorUserId,
    orgId: orgObjectId,
    action: `ADMIN_PROPERTY_${action}`,
    entityType: 'ADMIN',
    entityId: propertyObjectId,
    propertyId: propertyObjectId,
    metadata: { resource: 'PROPERTY', ...metadata },
  });
};

export const create = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validationResult = PropertyCreateSchema.safeParse(req.body);
    if (!validationResult.success) {
      const issues = validationResult.error.issues.map((issue: z.ZodIssue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      }));
      return errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid request data', issues);
    }

    // Body orgId takes precedence so admin can create for a landlord or any org.
    const orgId =
      req.body?.orgId ??
      req.body?.ownerEntityId ??
      req.auth?.orgId;

    if (!orgId) {
      return errorResponse(res, 401, 'UNAUTHORIZED', 'orgId required');
    }

    const body = req.body as Record<string, unknown>;
    const typeMap: Record<string, string> = {
      single_family: 'SFR',
      multifamily: 'MF',
      btr_community: 'BTR',
      condo_building: 'Condo',
    };
    const statusMap: Record<string, string> = {
      draft: 'ONBOARDING',
      active: 'LIVE',
      stabilizing: 'LIVE',
      stabilized: 'LIVE',
      disposed: 'PAUSED',
    };

    const data = {
      ...body,
      orgId: String(orgId),
      tokenizedPct: Number(body.tokenizedPct ?? 0) || 0,
      type: (typeMap[body.type as string] ?? body.type) as PropertyCreateDTO['type'],
      status: (statusMap[body.status as string] ?? body.status ?? 'ONBOARDING') as PropertyCreateDTO['status'],
    } as PropertyCreateDTO;

    const property = await createProperty(data);

    // Auto-create membership for the user if they don't have one in this org
    if (req.auth?._id) {
      const existingMembership = await Membership.findOne({
        userId: req.auth._id,
        orgId: new mongoose.Types.ObjectId(orgId),
        status: 'active'
      }).lean();

      if (!existingMembership) {
        await Membership.create({
          userId: req.auth._id,
          orgId: new mongoose.Types.ObjectId(orgId),
          roleInOrg: 'OWNER',
          status: 'active'
        });
      }
    }

    await writePropertyAuditEvents({
      auth: req.auth,
      orgId,
      propertyId: property._id,
      action: 'CREATED',
      diff: { after: { orgId: String(orgId) } },
    });

    return successResponse(res, { property }, 201);
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(res, err.statusCode, 'PROPERTY_CREATE_FAILED', err.message);
    }
    return errorResponse(res, 400, 'PROPERTY_CREATE_FAILED', (err as Error).message);
  }
};

export const getAllProperties = async (_: Request, res: Response) => {
  try {
    const properties = await allProperties();
    return successResponse(res, { properties });
  } catch (err) {
    return errorResponse(res, 500, 'PROPERTY_FETCH_FAILED', (err as Error).message);
  }
};

export const getPropertyById = async (req: Request, res: Response) => {
  try {
    const property = await getPropertyTree(req.params.id);
    if (!property) {
      return errorResponse(res, 404, 'PROPERTY_NOT_FOUND', 'Property not found');
    }
    return successResponse(res, { property });
  } catch (err) {
    return errorResponse(res, 500, 'PROPERTY_FETCH_FAILED', (err as Error).message);
  }
};

export const update = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = req.body as UpdatePropertyDTO;
    const updated = await updateProperty(req.params.id, data);

    await writePropertyAuditEvents({
      auth: req.auth,
      orgId: updated.orgId,
      propertyId: updated._id ?? req.params.id,
      action: 'UPDATED',
      diff: { after: { keys: Object.keys(data || {}) } },
      metadata: { keys: Object.keys(data || {}) },
    });

    return successResponse(res, { property: updated });
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(res, err.statusCode, 'PROPERTY_UPDATE_FAILED', err.message);
    }
    return errorResponse(res, 400, 'PROPERTY_UPDATE_FAILED', (err as Error).message);
  }
};

export const patch = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = req.body as UpdatePropertyDTO;
    const updated = await updateProperty(req.params.id, data);

    await writePropertyAuditEvents({
      auth: req.auth,
      orgId: updated.orgId,
      propertyId: updated._id ?? req.params.id,
      action: 'UPDATED',
      diff: { after: { keys: Object.keys(data || {}) } },
      metadata: { keys: Object.keys(data || {}) },
    });

    return successResponse(res, { property: updated });
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(res, err.statusCode, 'PROPERTY_UPDATE_FAILED', err.message);
    }
    return errorResponse(res, 400, 'PROPERTY_UPDATE_FAILED', (err as Error).message);
  }
};

export const handleDelete = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deleted = await deleteProperty(req.params.id);

    await writePropertyAuditEvents({
      auth: req.auth,
      orgId: deleted.orgId,
      propertyId: deleted._id ?? req.params.id,
      action: 'DELETED',
      diff: { before: { id: req.params.id }, after: null },
    });

    return successResponse(res, { property: deleted });
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(res, err.statusCode, 'PROPERTY_DELETE_FAILED', err.message);
    }
    return errorResponse(res, 404, 'PROPERTY_DELETE_FAILED', (err as Error).message);
  }
};
