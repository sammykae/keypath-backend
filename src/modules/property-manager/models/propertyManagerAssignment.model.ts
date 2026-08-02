import mongoose, { Schema, Document } from 'mongoose';

/**
 * Full permission matrix (Laurel's Property Manager epic, 2026-07-20).
 * Existing flags (ADD_TENANT, INVITE_TENANT, UPLOAD_TENANT_INFO, UPLOAD_NOTES,
 * SUBMIT_MAINTENANCE_UPDATES, MESSAGE_TENANT, UPLOAD_DOCUMENTS) are kept as-is —
 * already wired into notes.service.ts and chat.service.ts.
 */
export type PMPermission =
  // Property & roster
  | 'VIEW_PROPERTY'
  | 'EDIT_PROPERTY'
  | 'VIEW_UNITS'
  | 'EDIT_UNITS'
  | 'VIEW_TENANTS'
  | 'ADD_TENANT'
  | 'UPLOAD_TENANT_INFO'
  | 'INVITE_TENANT'
  | 'REMOVE_TENANT'
  | 'VIEW_LEASE_TERMS'
  | 'EDIT_LEASE_TERMS'
  | 'VIEW_LEASE_DOCUMENTS'
  | 'UPLOAD_LEASE_DOCUMENTS'
  | 'VIEW_RENT_DATA'
  | 'VIEW_ARREARS'
  // RPA — never default-on for landlord-invited PMs (Laurel adjustment, 2026-07-20)
  | 'RPA_VIEW'
  | 'RPA_CONFIGURE'
  | 'RPA_ENROLL_TENANT'
  | 'RPA_CREATE_REWARD'
  | 'RPA_CREATE_CAMPAIGN'
  | 'RPA_CREATE_CHALLENGE'
  | 'RPA_APPROVE_REDEMPTION'
  | 'RPA_ADJUST_BALANCE'
  | 'RPA_EXPORT'
  // TEPA — read-only by construction (no write endpoints exist for PM at all)
  | 'TEPA_VIEW'
  // Maintenance
  | 'MAINTENANCE_VIEW'
  | 'SUBMIT_MAINTENANCE_UPDATES'
  | 'MAINTENANCE_ASSIGN'
  | 'MAINTENANCE_ADD_NOTES'
  | 'MAINTENANCE_UPLOAD_ATTACHMENTS'
  | 'MAINTENANCE_AWARD_REWARD'
  // Messaging & notes
  | 'MESSAGE_TENANT'
  | 'MESSAGE_LANDLORD'
  | 'UPLOAD_NOTES'
  | 'UPLOAD_DOCUMENTS'
  // Reporting
  | 'VIEW_REPORTS'
  | 'VIEW_ACTIVITY_LOG'
  | 'VIEW_COMPLIANCE_STATUS'
  | 'EXPORT_REPORTS';

export const PM_PERMISSIONS: PMPermission[] = [
  'VIEW_PROPERTY',
  'EDIT_PROPERTY',
  'VIEW_UNITS',
  'EDIT_UNITS',
  'VIEW_TENANTS',
  'ADD_TENANT',
  'UPLOAD_TENANT_INFO',
  'INVITE_TENANT',
  'REMOVE_TENANT',
  'VIEW_LEASE_TERMS',
  'EDIT_LEASE_TERMS',
  'VIEW_LEASE_DOCUMENTS',
  'UPLOAD_LEASE_DOCUMENTS',
  'VIEW_RENT_DATA',
  'VIEW_ARREARS',
  'RPA_VIEW',
  'RPA_CONFIGURE',
  'RPA_ENROLL_TENANT',
  'RPA_CREATE_REWARD',
  'RPA_CREATE_CAMPAIGN',
  'RPA_CREATE_CHALLENGE',
  'RPA_APPROVE_REDEMPTION',
  'RPA_ADJUST_BALANCE',
  'RPA_EXPORT',
  'TEPA_VIEW',
  'MAINTENANCE_VIEW',
  'SUBMIT_MAINTENANCE_UPDATES',
  'MAINTENANCE_ASSIGN',
  'MAINTENANCE_ADD_NOTES',
  'MAINTENANCE_UPLOAD_ATTACHMENTS',
  'MAINTENANCE_AWARD_REWARD',
  'MESSAGE_TENANT',
  'MESSAGE_LANDLORD',
  'UPLOAD_NOTES',
  'UPLOAD_DOCUMENTS',
  'VIEW_REPORTS',
  'VIEW_ACTIVITY_LOG',
  'VIEW_COMPLIANCE_STATUS',
  'EXPORT_REPORTS',
];

/**
 * Default grant for a landlord-invited PM (source: LANDLORD_INVITE).
 * Per Laurel's spec §5 defaults + 2026-07-20 adjustment: RPA and TEPA are
 * NEVER default-on here — both require explicit landlord grant, even RPA_VIEW.
 */
export const DEFAULT_PM_PERMISSIONS: PMPermission[] = [
  'VIEW_PROPERTY',
  'VIEW_UNITS',
  'VIEW_TENANTS',
  'VIEW_LEASE_TERMS',
  'MAINTENANCE_VIEW',
  'SUBMIT_MAINTENANCE_UPDATES',
  'MAINTENANCE_ASSIGN',
  'MAINTENANCE_ADD_NOTES',
  'MAINTENANCE_UPLOAD_ATTACHMENTS',
  'MAINTENANCE_AWARD_REWARD',
  'MESSAGE_TENANT',
  'MESSAGE_LANDLORD',
  'UPLOAD_NOTES',
  'VIEW_REPORTS',
  'VIEW_ACTIVITY_LOG',
  'VIEW_COMPLIANCE_STATUS',
];

/**
 * Default grant for an independent RPA-only PM account (source: INDEPENDENT_RPA).
 * Gets the full RPA + roster + maintenance + messaging + reporting group
 * automatically — there's no landlord to gate it. Never includes TEPA_VIEW.
 */
export const INDEPENDENT_RPA_DEFAULT_PERMISSIONS: PMPermission[] = [
  'VIEW_PROPERTY',
  'EDIT_PROPERTY',
  'VIEW_UNITS',
  'EDIT_UNITS',
  'VIEW_TENANTS',
  'ADD_TENANT',
  'UPLOAD_TENANT_INFO',
  'INVITE_TENANT',
  'REMOVE_TENANT',
  'VIEW_LEASE_TERMS',
  'EDIT_LEASE_TERMS',
  'VIEW_LEASE_DOCUMENTS',
  'UPLOAD_LEASE_DOCUMENTS',
  'VIEW_RENT_DATA',
  'VIEW_ARREARS',
  'RPA_VIEW',
  'RPA_CONFIGURE',
  'RPA_ENROLL_TENANT',
  'RPA_CREATE_REWARD',
  'RPA_CREATE_CAMPAIGN',
  'RPA_CREATE_CHALLENGE',
  'RPA_APPROVE_REDEMPTION',
  'RPA_ADJUST_BALANCE',
  'RPA_EXPORT',
  'MAINTENANCE_VIEW',
  'SUBMIT_MAINTENANCE_UPDATES',
  'MAINTENANCE_ASSIGN',
  'MAINTENANCE_ADD_NOTES',
  'MAINTENANCE_UPLOAD_ATTACHMENTS',
  'MAINTENANCE_AWARD_REWARD',
  'MESSAGE_TENANT',
  'MESSAGE_LANDLORD',
  'UPLOAD_NOTES',
  'UPLOAD_DOCUMENTS',
  'VIEW_REPORTS',
  'VIEW_ACTIVITY_LOG',
  'VIEW_COMPLIANCE_STATUS',
  'EXPORT_REPORTS',
];

export type PMAssignmentSource = 'LANDLORD_INVITE' | 'INDEPENDENT_RPA';
export type PMAssignmentStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

/**
 * Scopes a Property Manager user to specific properties within a landlord's org.
 * "A property manager assigned to Property A cannot access Property B unless
 * explicitly assigned" (Laurel's docs) — enforced by requiring a row per property.
 *
 * Membership (org role) is never sufficient authorization on its own — every
 * data-access check gates through this row's status + permissions (see
 * assertPMPermission in propertyManager.service.ts). unitIds, when populated,
 * further restricts an otherwise property-wide assignment to specific units.
 */
export interface IPropertyManagerAssignment extends Document {
  _id: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  /** Absent for source: INDEPENDENT_RPA — there is no landlord yet. */
  landlordUserId?: mongoose.Types.ObjectId | null;
  propertyManagerUserId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  unitIds?: mongoose.Types.ObjectId[];
  permissions: PMPermission[];
  source: PMAssignmentSource;
  status: PMAssignmentStatus;
  /** Property Manager may initiate a 3-party (landlord+PM+tenant) group thread on this assignment. Off by default (Laurel, 2026-07-20). */
  allowGroupChat: boolean;
  assignedBy: mongoose.Types.ObjectId;
  revokedAt?: Date | null;
  revokedBy?: mongoose.Types.ObjectId | null;
  revocationReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IPropertyManagerAssignment>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    landlordUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    propertyManagerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    unitIds: { type: [Schema.Types.ObjectId], ref: 'Unit', default: undefined },
    permissions: { type: [String], enum: PM_PERMISSIONS, default: DEFAULT_PM_PERMISSIONS },
    source: { type: String, enum: ['LANDLORD_INVITE', 'INDEPENDENT_RPA'], default: 'LANDLORD_INVITE' },
    status: { type: String, enum: ['PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED'], default: 'ACTIVE', index: true },
    allowGroupChat: { type: Boolean, default: false },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    revocationReason: { type: String, default: null },
  },
  { timestamps: true, collection: 'property_manager_assignments' }
);

schema.index(
  { propertyManagerUserId: 1, propertyId: 1 },
  { unique: true, partialFilterExpression: { status: 'ACTIVE' } }
);
schema.index({ orgId: 1, propertyId: 1, status: 1 });

export const PropertyManagerAssignmentModel = mongoose.model<IPropertyManagerAssignment>(
  'PropertyManagerAssignment',
  schema
);
