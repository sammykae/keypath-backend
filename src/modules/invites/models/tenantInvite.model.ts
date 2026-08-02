import mongoose, { Schema, Document } from "mongoose";

export type TenantInviteParticipationModel = "RPA_ONLY" | "TEPA_ONLY" | "BOTH";
export type TenantInviteMethod = "CODE" | "LINK" | "BOTH";
export type TenantInviteDeliveryMethod = "LANDLORD_SHARED" | "KEYPATH_EMAIL";
export type TenantInviteRequiredAgreement = "RPA" | "TEPA" | "RPA_AND_TEPA";

export type TenantInviteStatus = "PENDING" | "SENT" | "ACCEPTED" | "EXPIRED" | "CANCELLED";

export interface TenantInvite extends Document {
  _id: mongoose.Types.ObjectId;

  tenantId?: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  unitId: mongoose.Types.ObjectId;

  tenantEmail: string;

  participationModel: TenantInviteParticipationModel;
  inviteMethod: TenantInviteMethod;
  deliveryMethod: TenantInviteDeliveryMethod;
  requiredAgreements: TenantInviteRequiredAgreement[];

  inviteCode?: string;
  inviteToken: string;

  status: TenantInviteStatus;
  expiresAt: Date;
  acceptedAt?: Date;

  // OTP for acceptance (used by current frontend flow)
  otpHash?: string;
  otpExpiresAt?: Date;
  otpSentAt?: Date;

  // Optional lease context (for UI summary; can be filled later from tenancy)
  leaseStartDate?: Date;
  leaseEndDate?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const TenantInviteSchema = new Schema<TenantInvite>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: false },
    propertyId: { type: Schema.Types.ObjectId, ref: "Property", required: true, index: true },
    unitId: { type: Schema.Types.ObjectId, ref: "Unit", required: true, index: true },

    tenantEmail: { type: String, required: true, lowercase: true, trim: true, index: true },

    participationModel: {
      type: String,
      enum: ["RPA_ONLY", "TEPA_ONLY", "BOTH"],
      required: true,
      index: true,
    },
    inviteMethod: {
      type: String,
      enum: ["CODE", "LINK", "BOTH"],
      required: true,
      index: true,
    },
    deliveryMethod: {
      type: String,
      enum: ["LANDLORD_SHARED", "KEYPATH_EMAIL"],
      required: true,
    },
    requiredAgreements: {
      type: [String],
      enum: ["RPA", "TEPA", "RPA_AND_TEPA"],
      required: true,
    },

    inviteCode: { type: String, required: false },
    inviteToken: { type: String, required: true, unique: true, index: true },

    status: {
      type: String,
      enum: ["PENDING", "SENT", "ACCEPTED", "EXPIRED", "CANCELLED"],
      required: true,
      default: "SENT",
      index: true,
    },
    expiresAt: { type: Date, required: true, index: true },
    acceptedAt: { type: Date, required: false },

    otpHash: { type: String, required: false },
    otpExpiresAt: { type: Date, required: false },
    otpSentAt: { type: Date, required: false },

    leaseStartDate: { type: Date, required: false },
    leaseEndDate: { type: Date, required: false },
  },
  { timestamps: true }
);

TenantInviteSchema.index({ tenantEmail: 1, status: 1 });

export const TenantInviteModel = mongoose.model<TenantInvite>(
  "TenantInvite",
  TenantInviteSchema,
  "tenant_invites"
);

