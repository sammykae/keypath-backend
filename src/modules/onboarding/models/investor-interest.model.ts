import mongoose, { Document, Schema, Types } from 'mongoose';

export type InvestorInterestStatus =
  | 'SUBMITTED'
  | 'INVITE_GENERATED'
  | 'ONBOARDED'
  | 'REJECTED';

export interface IInvestorInterest extends Document {
  firstName: string;
  lastName: string;
  email: string;
  investorType: string;
  phoneNumber?: string;
  typicalCheckSize?: string;
  linkedinUrl?: string;
  message?: string;
  status: InvestorInterestStatus;
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

const InvestorInterestSchema = new Schema<IInvestorInterest>(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    investorType: { type: String, required: true, trim: true },
    phoneNumber: { type: String, required: false, trim: true },
    typicalCheckSize: { type: String, required: false, trim: true },
    linkedinUrl: { type: String, required: false, trim: true },
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
  { timestamps: true, collection: 'investor_interest_requests' }
);

InvestorInterestSchema.index({ createdAt: -1 });
InvestorInterestSchema.index({ email: 1, createdAt: -1 });
InvestorInterestSchema.index({ status: 1, createdAt: -1 });

export const InvestorInterestModel = mongoose.model<IInvestorInterest>(
  'InvestorInterest',
  InvestorInterestSchema
);
