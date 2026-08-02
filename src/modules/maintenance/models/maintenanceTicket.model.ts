import mongoose, { Schema, Document } from 'mongoose';

export type MaintenanceSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export type MaintenanceStatus = 'OPEN' | 'UNDER_REVIEW' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED' | 'CLOSED';
export type MaintenanceIssueType = 'PLUMBING' | 'HVAC' | 'APPLIANCE' | 'MOISTURE' | 'ELECTRICAL' | 'GENERAL';
export type MaintenanceRewardDecision = 'PENDING' | 'APPROVED' | 'DENIED';

export const MAINTENANCE_STATUSES: MaintenanceStatus[] = ['OPEN', 'UNDER_REVIEW', 'IN_PROGRESS', 'RESOLVED', 'REJECTED', 'CLOSED'];
export const MAINTENANCE_ISSUE_TYPES: MaintenanceIssueType[] = ['PLUMBING', 'HVAC', 'APPLIANCE', 'MOISTURE', 'ELECTRICAL', 'GENERAL'];

// UI-facing labels per product spec (Submitted / Under Review / In Progress / Completed / Rejected)
export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  OPEN: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Completed',
  REJECTED: 'Rejected',
  CLOSED: 'Closed',
};

export interface IMaintenanceAttachment {
  fileKey: string;
  fileName: string;
  fileType: string;
}

export type MaintenanceNoteAuthorRole = 'landlord' | 'property_manager' | 'admin';

export interface IMaintenanceNote {
  text: string;
  authorId: mongoose.Types.ObjectId;
  authorRole: MaintenanceNoteAuthorRole;
  createdAt: Date;
}

export interface IMaintenanceTicket extends Document {
  _id: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  unitId?: mongoose.Types.ObjectId;
  tenantUserId: mongoose.Types.ObjectId;
  title: string;
  description: string;
  issueType: MaintenanceIssueType;
  severity: MaintenanceSeverity;
  status: MaintenanceStatus;
  rewardEligible: boolean | null;
  rewardDecision: MaintenanceRewardDecision;
  creditsAwarded: number;
  attachments: IMaintenanceAttachment[];
  notes: IMaintenanceNote[];
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IMaintenanceTicket>(
  {
    orgId:         { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    propertyId:    { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    unitId:        { type: Schema.Types.ObjectId, ref: 'Unit', index: true },
    tenantUserId:  { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title:         { type: String, required: true, trim: true },
    description:   { type: String, default: '' },
    issueType:     { type: String, enum: MAINTENANCE_ISSUE_TYPES, default: 'GENERAL' },
    severity:      { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'LOW' },
    status:        { type: String, enum: MAINTENANCE_STATUSES, default: 'OPEN' },
    rewardEligible:{ type: Boolean, default: null },
    rewardDecision:{ type: String, enum: ['PENDING', 'APPROVED', 'DENIED'], default: 'PENDING' },
    creditsAwarded:{ type: Number, default: 0, min: 0 },
    attachments:   {
      type: [{ fileKey: String, fileName: String, fileType: String }],
      default: [],
    },
    notes: {
      type: [{
        text: { type: String, required: true, trim: true, maxlength: 2000 },
        authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        authorRole: { type: String, enum: ['landlord', 'property_manager', 'admin'], required: true },
        createdAt: { type: Date, required: true, default: Date.now },
      }],
      default: [],
    },
    resolvedAt:    { type: Date },
  },
  { timestamps: true, collection: 'maintenanceTickets' }
);

schema.index({ tenantUserId: 1, status: 1 });
schema.index({ orgId: 1, status: 1 });

export const MaintenanceTicketModel = mongoose.model<IMaintenanceTicket>('MaintenanceTicket', schema);
