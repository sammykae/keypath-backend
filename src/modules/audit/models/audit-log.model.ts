import { Schema, model, Types } from 'mongoose';
import { User } from '../../auth/models/user.model';

export interface AuditDiff {
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
}


export interface IAuditEvent {
  actorUserId?: Types.ObjectId;
  /** Actor's role at the time of the action — required per the audit-log ticket's field list. Auto-resolved from actorUserId on save if not passed explicitly, so every existing call site gets this for free. */
  userRole?: string;
  orgId?: Types.ObjectId;
  action: string;
  entityType: string;
  entityId?: Types.ObjectId;
  source: 'user' | 'system';
  updateType: 'manual' | 'system_generated';
  propertyId?: Types.ObjectId | null;
  tenantId?: Types.ObjectId | null;
  metadata?: Record<string, unknown> | null;
  diff?: AuditDiff;
  /** Flat alias for diff.before — kept in sync so consumers can read either the ticket's exact field names or the pre-existing diff shape. */
  oldValue?: Record<string, any> | null;
  /** Flat alias for diff.after. */
  newValue?: Record<string, any> | null;
  createdAt: Date;
}

const AuditEventSchema = new Schema<IAuditEvent>(
  {
    actorUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },

    userRole: {
      type: String,
      index: true,
    },

    orgId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
    },

    action: {
      type: String,
      required: true,
      index: true,
    },

    entityType: {
      type: String,
      required: true,
      index: true,
    },

    entityId: {
      type: Schema.Types.ObjectId,
    },

    source: {
      type: String,
      enum: ['user', 'system'],
      required: true,
      index: true,
    },

    updateType: {
      type: String,
      enum: ['manual', 'system_generated'],
      required: true,
      index: true,
    },

    propertyId: {
      type: Schema.Types.ObjectId,
      ref: 'Property',
      index: true,
      default: null,
    },

    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      default: null,
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: null,
    },

    diff: {
      before: Schema.Types.Mixed,
      after: Schema.Types.Mixed,
    },

    oldValue: {
      type: Schema.Types.Mixed,
      default: null,
    },

    newValue: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'audit_events',
  }
);

/* Indexes for admin queries */
AuditEventSchema.index({ orgId: 1, createdAt: -1 });
AuditEventSchema.index({ actorUserId: 1, createdAt: -1 });
AuditEventSchema.index({ source: 1, createdAt: -1 });
AuditEventSchema.index({ propertyId: 1, createdAt: -1 });

/**
 * Retroactively closes two gaps for every existing call site (dozens across
 * this codebase) without having to touch each one:
 *  1. userRole wasn't captured anywhere — resolved here from actorUserId.
 *  2. The ticket's required fields are oldValue/newValue (flat), but the
 *     established convention everywhere in this codebase is diff.before/after
 *     — synced both ways so either shape is queryable.
 *
 * Exported standalone (rather than inlined in `.pre('save', ...)`) so it can
 * be unit-tested by calling it directly against a fake `this`, without needing
 * a live Mongoose connection.
 */
export async function applyAuditEventPreSave(this: IAuditEvent, next: (err?: Error) => void) {
  if (!this.userRole && this.actorUserId) {
    try {
      const actor = await User.findById(this.actorUserId).select('role').lean();
      if (actor) this.userRole = (actor as any).role?.toLowerCase();
    } catch {
      // never block the audit write over a role lookup failure
    }
  }

  if (this.diff) {
    if (this.oldValue === undefined || this.oldValue === null) this.oldValue = this.diff.before ?? null;
    if (this.newValue === undefined || this.newValue === null) this.newValue = this.diff.after ?? null;
  } else if (this.oldValue !== undefined || this.newValue !== undefined) {
    this.diff = { before: this.oldValue ?? null, after: this.newValue ?? null };
  }

  next();
}

AuditEventSchema.pre('save', applyAuditEventPreSave);

export const AuditEvent = model<IAuditEvent>(
  'AuditEvent',
  AuditEventSchema
);
