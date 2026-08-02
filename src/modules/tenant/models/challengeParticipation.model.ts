import mongoose, { Schema, Document } from 'mongoose';

export type ChallengeParticipationStatus =
  | 'IN_PROGRESS'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'COMPLETED'
  | 'EXPIRED';

export interface IChallengeParticipation extends Document {
  challengeId: mongoose.Types.ObjectId;
  tenantUserId: mongoose.Types.ObjectId;
  status: ChallengeParticipationStatus;
  submittedAt?: Date | null;
  proofUrl?: string | null;
  reviewedBy?: mongoose.Types.ObjectId | null;
  reviewedAt?: Date | null;
  rejectionReason?: string | null;
  rewardIssued: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ChallengeParticipationSchema = new Schema<IChallengeParticipation>(
  {
    challengeId:     { type: Schema.Types.ObjectId, ref: 'TenantChallenge', required: true, index: true },
    tenantUserId:    { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status:          {
      type: String,
      enum: ['IN_PROGRESS', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED', 'EXPIRED'],
      default: 'IN_PROGRESS',
      index: true,
    },
    submittedAt:     { type: Date, default: null },
    proofUrl:        { type: String, default: null },
    reviewedBy:      { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt:      { type: Date, default: null },
    rejectionReason: { type: String, default: null },
    rewardIssued:    { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'challenge_participations' }
);

// One active participation per tenant per challenge
ChallengeParticipationSchema.index(
  { challengeId: 1, tenantUserId: 1 },
  { unique: true }
);

export const ChallengeParticipationModel = mongoose.model<IChallengeParticipation>(
  'ChallengeParticipation',
  ChallengeParticipationSchema
);
