import mongoose from 'mongoose';
import { writeAuditEvent } from '../../audit/services/audit.service';

export interface LogActivityParams {
  orgId: string | mongoose.Types.ObjectId;
  entityType: string;
  entityId: string | mongoose.Types.ObjectId;
  actorId: string | mongoose.Types.ObjectId;
  action: string;
  meta?: Record<string, any>;
}

function toAuditEntityType(entityType: string): string {
  const key = entityType.trim().toLowerCase();
  const map: Record<string, string> = {
    property: 'PROPERTY',
    tenant: 'TENANT',
    tenancy: 'TENANCY',
    document: 'DOCUMENT',
    ledger: 'LEDGER',
    token: 'TOKEN',
    unit: 'UNIT',
  };
  return map[key] ?? entityType.trim().toUpperCase();
}

/**
 * Logs an activity event. Writes to the canonical audit_events collection
 * via writeAuditEvent so all audit data is co-located in one collection.
 */
export const logActivity = async (params: LogActivityParams): Promise<void> => {
  try {
    const {
      orgId,
      entityType,
      entityId,
      actorId,
      action,
      meta = {}
    } = params;

    const toObjectId = (v: string | mongoose.Types.ObjectId) =>
      typeof v === 'string' ? new mongoose.Types.ObjectId(v) : v;

    let propertyOid: mongoose.Types.ObjectId | undefined;
    let tenantOid: mongoose.Types.ObjectId | undefined;
    const mp = meta.propertyId ?? meta.property_id;
    const tn = meta.tenantId ?? meta.tenantUserId ?? meta.tenant_user_id;
    if (mp && mongoose.Types.ObjectId.isValid(String(mp))) {
      propertyOid = new mongoose.Types.ObjectId(String(mp));
    }
    if (tn && mongoose.Types.ObjectId.isValid(String(tn))) {
      tenantOid = new mongoose.Types.ObjectId(String(tn));
    }

    await writeAuditEvent({
      actorUserId: toObjectId(actorId),
      orgId: toObjectId(orgId),
      action,
      entityType: toAuditEntityType(entityType),
      entityId: toObjectId(entityId),
      propertyId: propertyOid,
      tenantId: tenantOid,
      metadata: Object.keys(meta).length > 0 ? { ...meta } : null,
      diff: Object.keys(meta).length > 0 ? { before: null, after: meta } : undefined,
    });
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
};

/**
 * Helper to log tokenization config changes
 */
export const logTokenizationActivity = async (
  orgId: string | mongoose.Types.ObjectId,
  propertyId: string | mongoose.Types.ObjectId,
  actorId: string | mongoose.Types.ObjectId,
  action: 'TOKENIZATION_CONFIG_CREATED' | 'TOKENIZATION_CONFIG_UPDATED',
  changes?: Record<string, any>
): Promise<void> => {
  await logActivity({
    orgId,
    entityType: 'token',
    entityId: propertyId,
    actorId,
    action,
    meta: {
      propertyId: typeof propertyId === 'string' ? propertyId : propertyId.toString(),
      changes,
      timestamp: new Date().toISOString()
    }
  });
};

/**
 * Helper to log tenant changes
 */
export const logTenantActivity = async (
  orgId: string | mongoose.Types.ObjectId,
  tenantId: string | mongoose.Types.ObjectId,
  propertyId: string | mongoose.Types.ObjectId,
  actorId: string | mongoose.Types.ObjectId,
  action: 'TENANT_CREATED' | 'TENANT_UPDATED' | 'TENANT_ENROLLED' | 'TENANT_KYC_STATUS_CHANGED',
  changes?: Record<string, any>
): Promise<void> => {
  await logActivity({
    orgId,
    entityType: 'tenant',
    entityId: tenantId,
    actorId,
    action,
    meta: {
      propertyId: typeof propertyId === 'string' ? propertyId : propertyId.toString(),
      tenantId: typeof tenantId === 'string' ? tenantId : tenantId.toString(),
      changes,
      timestamp: new Date().toISOString()
    }
  });
};
