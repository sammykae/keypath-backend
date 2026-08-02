import mongoose from 'mongoose';
import { AuditEvent } from '../models/audit-log.model';

export interface QueryAuditActivityParams {
  propertyId: string;
  entityType?: string;
  action?: string;
  actorUserId?: string;
  tenantId?: string;
  from?: string;
  to?: string;
  limit?: number;
  skip?: number;
}

export interface AuditActivityRowDTO {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorUserId: string | null;
  orgId: string | null;
  propertyId: string | null;
  tenantId: string | null;
  metadata: Record<string, unknown> | null;
  diff: unknown;
  createdAt: string;
}

function toRow(doc: Record<string, unknown>): AuditActivityRowDTO {
  const d = doc as {
    _id: mongoose.Types.ObjectId;
    action: string;
    entityType: string;
    entityId?: mongoose.Types.ObjectId;
    actorUserId?: mongoose.Types.ObjectId;
    orgId?: mongoose.Types.ObjectId;
    propertyId?: mongoose.Types.ObjectId | null;
    tenantId?: mongoose.Types.ObjectId | null;
    metadata?: Record<string, unknown> | null;
    diff?: unknown;
    createdAt: Date;
  };
  return {
    id: d._id.toString(),
    action: d.action,
    entityType: d.entityType,
    entityId: d.entityId?.toString() ?? null,
    actorUserId: d.actorUserId?.toString() ?? null,
    orgId: d.orgId?.toString() ?? null,
    propertyId: d.propertyId?.toString() ?? null,
    tenantId: d.tenantId?.toString() ?? null,
    metadata: d.metadata ?? null,
    diff: d.diff ?? null,
    createdAt: d.createdAt.toISOString(),
  };
}

export async function queryAuditActivityByProperty(
  params: QueryAuditActivityParams
): Promise<{ items: AuditActivityRowDTO[]; total: number }> {
  const limit = Math.min(Math.max(1, params.limit ?? 50), 100);
  const skip = Math.max(0, params.skip ?? 0);
  const filter: Record<string, unknown> = {
    propertyId: new mongoose.Types.ObjectId(params.propertyId),
  };
  if (params.entityType) filter.entityType = params.entityType;
  if (params.action) filter.action = params.action;
  if (params.actorUserId) filter.actorUserId = new mongoose.Types.ObjectId(params.actorUserId);
  if (params.tenantId) filter.tenantId = new mongoose.Types.ObjectId(params.tenantId);
  const created: { $gte?: Date; $lte?: Date } = {};
  if (params.from) {
    const t = new Date(params.from);
    if (!Number.isNaN(t.getTime())) created.$gte = t;
  }
  if (params.to) {
    const t = new Date(params.to);
    if (!Number.isNaN(t.getTime())) created.$lte = t;
  }
  if (Object.keys(created).length > 0) {
    filter.createdAt = created;
  }

  const [items, total] = await Promise.all([
    AuditEvent.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditEvent.countDocuments(filter),
  ]);

  return {
    items: items.map((row) => toRow(row as Record<string, unknown>)),
    total,
  };
}
