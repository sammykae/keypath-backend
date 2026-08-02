import mongoose, { Document, Schema, Types } from 'mongoose';

export type LandlordInterestStatus =
  | 'SUBMITTED'
  | 'INVITE_GENERATED'
  | 'ONBOARDED'
  | 'REJECTED';

export interface ILandlordInterest extends Document {
  firstName: string;
  lastName: string;
  email: string;
  propertyType: string;
  titleOrRoleAtOrganization: string;
  country: string;
  stateOrProvince: string;
  city: string;
  phoneNumber?: string;
  numberOfUnitsRange?: string;
  messageNotes?: string;
  status: LandlordInterestStatus;
  rejectionReason?: string | null;
  onboardingInviteId?: string | null;
  onboardingInviteIssuedAt?: Date | null;
  onboardingInviteExpiresAt?: Date | null;
  onboardingInviteUsedAt?: Date | null;
  onboardingInviteIssuedByUserId?: Types.ObjectId | null;
  onboardedUserId?: Types.ObjectId | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const LandlordInterestSchema = new Schema<ILandlordInterest>(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    propertyType: { type: String, required: true, trim: true },
    titleOrRoleAtOrganization: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    stateOrProvince: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    phoneNumber: { type: String, required: false, trim: true },
    numberOfUnitsRange: { type: String, required: false, trim: true },
    messageNotes: { type: String, required: false, trim: true },
    status: {
      type: String,
      required: true,
      enum: ['SUBMITTED', 'INVITE_GENERATED', 'ONBOARDED', 'REJECTED'],
      default: 'SUBMITTED',
    },
    rejectionReason: { type: String, required: false, default: null },
    onboardingInviteId: { type: String, required: false, default: null },
    onboardingInviteIssuedAt: { type: Date, required: false, default: null },
    onboardingInviteExpiresAt: { type: Date, required: false, default: null },
    onboardingInviteUsedAt: { type: Date, required: false, default: null },
    onboardingInviteIssuedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      default: null,
    },
    onboardedUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      default: null,
    },
  },
  { timestamps: true, collection: 'landlord_interest_requests' }
);

LandlordInterestSchema.index({ createdAt: -1 });
LandlordInterestSchema.index({ email: 1, createdAt: -1 });
LandlordInterestSchema.index({ status: 1, createdAt: -1 });

export const LandlordInterestModel = mongoose.model<ILandlordInterest>(
  'LandlordInterest',
  LandlordInterestSchema
);
