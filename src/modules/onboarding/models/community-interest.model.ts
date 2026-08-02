import mongoose, { Document, Schema, Types } from 'mongoose';

export type CommunityInterestStatus =
  | 'SUBMITTED'
  | 'INVITE_GENERATED'
  | 'ONBOARDED'
  | 'REJECTED';

export interface ICommunityInterest extends Document {
  firstName: string;
  lastName: string;
  email: string;
  organizationName: string;
  stakeholderType: string;
  titleOrRoleAtOrganization: string;
  phoneNumber?: string;
  cityOrRegionServed?: string;
  messageContext?: string;
  status: CommunityInterestStatus;
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

const CommunityInterestSchema = new Schema<ICommunityInterest>(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    organizationName: { type: String, required: true, trim: true },
    stakeholderType: { type: String, required: true, trim: true },
    titleOrRoleAtOrganization: { type: String, required: true, trim: true },
    phoneNumber: { type: String, required: false, trim: true },
    cityOrRegionServed: { type: String, required: false, trim: true },
    messageContext: { type: String, required: false, trim: true },
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
  { timestamps: true, collection: 'community_interest_requests' }
);

CommunityInterestSchema.index({ createdAt: -1 });
CommunityInterestSchema.index({ email: 1, createdAt: -1 });
CommunityInterestSchema.index({ status: 1, createdAt: -1 });

export const CommunityInterestModel = mongoose.model<ICommunityInterest>(
  'CommunityInterest',
  CommunityInterestSchema
);
