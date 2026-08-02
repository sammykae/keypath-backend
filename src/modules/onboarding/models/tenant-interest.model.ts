import mongoose, { Document, Schema, Types } from 'mongoose';

export type TenantInterestStatus =
  | 'SUBMITTED'
  | 'INVITE_GENERATED'
  | 'ONBOARDED'
  | 'REJECTED';

export interface ITenantInterest extends Document {
  firstName: string;
  lastName: string;
  email: string;
  country: string;
  stateOrProvince: string;
  city: string;
  currentHousingType: string;
  propertyAddress: string;
  propertyCountry: string;
  propertyStateOrProvince: string;
  propertyCity: string;
  phoneNumber?: string;
  landlordOrPropertyManagerName?: string;
  message?: string;
  status: TenantInterestStatus;
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

const TenantInterestSchema = new Schema<ITenantInterest>(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    country: { type: String, required: true, trim: true },
    stateOrProvince: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    currentHousingType: { type: String, required: true, trim: true },
    propertyAddress: { type: String, required: true, trim: true },
    propertyCountry: { type: String, required: true, trim: true },
    propertyStateOrProvince: { type: String, required: true, trim: true },
    propertyCity: { type: String, required: true, trim: true },
    phoneNumber: { type: String, required: false, trim: true },
    landlordOrPropertyManagerName: { type: String, required: false, trim: true },
    message: { type: String, required: false, trim: true },
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
  { timestamps: true, collection: 'tenant_interest_requests' }
);

TenantInterestSchema.index({ createdAt: -1 });
TenantInterestSchema.index({ email: 1, createdAt: -1 });
TenantInterestSchema.index({ status: 1, createdAt: -1 });

export const TenantInterestModel = mongoose.model<ITenantInterest>(
  'TenantInterest',
  TenantInterestSchema
);
