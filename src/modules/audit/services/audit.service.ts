import { Types } from 'mongoose';
import { AuditEvent, AuditDiff } from '../models/audit-log.model';

export interface WriteAuditParams {
  actorUserId?: Types.ObjectId;
  /** Optional explicit override — auto-resolved from actorUserId if omitted. */
  userRole?: string;
  orgId?: Types.ObjectId;
  action: string;
  entityType: string;
  entityId?: Types.ObjectId;
  source?: 'user' | 'system';
  updateType?: 'manual' | 'system_generated';
  propertyId?: Types.ObjectId | null;
  tenantId?: Types.ObjectId | null;
  metadata?: Record<string, unknown> | null;
  diff?: AuditDiff;
  oldValue?: Record<string, any> | null;
  newValue?: Record<string, any> | null;
}

export async function writeAuditEvent(params: WriteAuditParams) {
  try {
    // Default classification keeps legacy callers working after source/updateType became required.
    const source = params.source ?? (params.actorUserId ? 'user' : 'system');
    const updateType = params.updateType ?? (params.actorUserId ? 'manual' : 'system_generated');

    await AuditEvent.create({
      ...params,
      source,
      updateType,
      createdAt: new Date(),
    });
  } catch (err) {
  
    console.error('[AUDIT_WRITE_FAILED]', err);
  }
}
