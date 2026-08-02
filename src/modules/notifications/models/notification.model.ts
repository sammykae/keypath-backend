import mongoose, { Schema, Document } from 'mongoose';

/**
 * Real, persisted notification table (P1 - Build Notifications and Activity
 * Trail). Before this, the tenant/landlord "notification" feeds
 * (tenantNotifications.service.ts / landlordNotifications.service.ts) were
 * either fully re-derived from current entity state on every request (tenant
 * side — no row per event, a maintenance ticket's "in progress" notification
 * is overwritten once it resolves) or read from ActivityModel, which has no
 * recipientId/recipientRole/readStatus/eventTitle/eventDescription fields at
 * all and is populated from only a handful of action sites. This is the
 * single backend-generated table the ticket asks for, with per-notification
 * read status (not a single global "lastReadAt" cursor).
 */
export type NotificationRecipientRole = 'tenant' | 'landlord' | 'property_manager' | 'admin';

export type NotificationEventType =
  | 'TENANT_REGISTERED'
  | 'TENANT_INVITE_ACCEPTED'
  | 'MAINTENANCE_SUBMITTED'
  | 'MAINTENANCE_STATUS_CHANGED'
  | 'PM_NOTE_ADDED'
  | 'REWARD_SUBMITTED'
  | 'REWARD_APPROVED'
  | 'REWARD_DENIED'
  | 'RPA_SIGNED'
  | 'TEPA_SIGNED'
  | 'COMPLIANCE_DOCUMENT_UPLOADED'
  | 'COMPLIANCE_DOCUMENT_PENDING_REVIEW'
  | 'PAYMENT_STATUS_CHANGED'
  | 'PAYMENT_LATE'
  | 'LEASE_EXPIRING'
  | 'LIQUIDITY_REQUEST_SUBMITTED'
  | 'CHAT_MESSAGE_RECEIVED';

export const NOTIFICATION_EVENT_TYPES: NotificationEventType[] = [
  'TENANT_REGISTERED', 'TENANT_INVITE_ACCEPTED', 'MAINTENANCE_SUBMITTED', 'MAINTENANCE_STATUS_CHANGED',
  'PM_NOTE_ADDED', 'REWARD_SUBMITTED', 'REWARD_APPROVED', 'REWARD_DENIED', 'RPA_SIGNED', 'TEPA_SIGNED',
  'COMPLIANCE_DOCUMENT_UPLOADED', 'COMPLIANCE_DOCUMENT_PENDING_REVIEW', 'PAYMENT_STATUS_CHANGED',
  'PAYMENT_LATE', 'LEASE_EXPIRING', 'LIQUIDITY_REQUEST_SUBMITTED', 'CHAT_MESSAGE_RECEIVED',
];

export interface INotification extends Document {
  _id: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId | null;
  recipientId: mongoose.Types.ObjectId;
  recipientRole: NotificationRecipientRole;
  landlordId?: mongoose.Types.ObjectId | null;
  propertyId?: mongoose.Types.ObjectId | null;
  unitId?: mongoose.Types.ObjectId | null;
  tenantId?: mongoose.Types.ObjectId | null;
  eventType: NotificationEventType;
  eventTitle: string;
  eventDescription: string;
  readStatus: boolean;
  createdAt: Date;
}

const schema = new Schema<INotification>(
  {
    userId:          { type: Schema.Types.ObjectId, ref: 'User', default: null },
    recipientId:     { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recipientRole:   { type: String, enum: ['tenant', 'landlord', 'property_manager', 'admin'], required: true },
    landlordId:      { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    propertyId:      { type: Schema.Types.ObjectId, ref: 'Property', default: null, index: true },
    unitId:          { type: Schema.Types.ObjectId, ref: 'Unit', default: null },
    tenantId:         { type: Schema.Types.ObjectId, ref: 'User', default: null },
    eventType:       { type: String, enum: NOTIFICATION_EVENT_TYPES, required: true, index: true },
    eventTitle:      { type: String, required: true, trim: true, maxlength: 200 },
    eventDescription:{ type: String, required: true, trim: true, maxlength: 1000 },
    readStatus:      { type: Boolean, default: false, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'notifications' }
);

schema.index({ recipientId: 1, createdAt: -1 });
schema.index({ recipientId: 1, readStatus: 1 });

export const NotificationModel = mongoose.model<INotification>('Notification', schema);
