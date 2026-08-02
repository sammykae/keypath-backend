import mongoose, { Schema, Document } from 'mongoose';

/**
 * Activation invite for a Property Manager user. Mirrors the tenant invite
 * flow (TenantInviteModel / tenantInvite.service.ts) — passwordless,
 * OTP-based: PM users are provisioned with no password (see
 * findOrCreatePMUser); this invite is how they prove email ownership and
 * get a session.
 */

/**
 * SENT → OPENED (first time the PM views the invite) → ACCEPTED.
 * DECLINED / REVOKED / EXPIRED are terminal. No DRAFT state — a landlord
 * invite is always created and sent in the same action (Ticket 7), there's
 * no server-side "compose without sending" step to represent.
 */
export type PMInviteStatus = 'SENT' | 'OPENED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'REVOKED';

export interface IPropertyManagerInvite extends Document {
  _id: mongoose.Types.ObjectId;
  propertyManagerUserId: mongoose.Types.ObjectId;
  assignmentId: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  email: string;
  inviteToken: string;
  status: PMInviteStatus;
  expiresAt: Date;
  acceptedAt?: Date | null;
  otpHash?: string | null;
  otpExpiresAt?: Date | null;
  otpSentAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IPropertyManagerInvite>(
  {
    propertyManagerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    assignmentId: { type: Schema.Types.ObjectId, ref: 'PropertyManagerAssignment', required: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    inviteToken: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: ['SENT', 'OPENED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED'], default: 'SENT', index: true },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date, default: null },
    otpHash: { type: String, default: null },
    otpExpiresAt: { type: Date, default: null },
    otpSentAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'property_manager_invites' }
);

export const PropertyManagerInviteModel = mongoose.model<IPropertyManagerInvite>(
  'PropertyManagerInvite',
  schema
);
