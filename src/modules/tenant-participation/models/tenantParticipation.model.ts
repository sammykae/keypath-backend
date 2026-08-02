import mongoose, { Schema, Document } from 'mongoose';

export type TenantParticipationType = 'NONE' | 'RPA_ONLY' | 'TEPA_ONLY' | 'BOTH';

export type ProgramEnrollmentStatus = 'PENDING' | 'ACTIVE' | 'DECLINED' | 'ENDED';

export interface TenantParticipation extends Document {
  _id: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  tenancyId: mongoose.Types.ObjectId;
  tenantParticipationType: TenantParticipationType;
  rpaEnrollmentStatus: ProgramEnrollmentStatus;
  tepaEnrollmentStatus: ProgramEnrollmentStatus;
  createdAt: Date;
  updatedAt: Date;
}

const TenantParticipationSchema = new Schema<TenantParticipation>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    tenancyId: { type: Schema.Types.ObjectId, ref: 'Tenancy', required: true, unique: true },
    tenantParticipationType: {
      type: String,
      enum: ['NONE', 'RPA_ONLY', 'TEPA_ONLY', 'BOTH'],
      required: true,
      default: 'NONE',
    },
    rpaEnrollmentStatus: {
      type: String,
      enum: ['PENDING', 'ACTIVE', 'DECLINED', 'ENDED'],
      required: true,
      default: 'PENDING',
    },
    tepaEnrollmentStatus: {
      type: String,
      enum: ['PENDING', 'ACTIVE', 'DECLINED', 'ENDED'],
      required: true,
      default: 'PENDING',
    },
  },
  { timestamps: true, collection: 'tenant_participation' }
);

TenantParticipationSchema.index({ tenantId: 1, propertyId: 1 });

export const TenantParticipationModel = mongoose.model<TenantParticipation>(
  'TenantParticipation',
  TenantParticipationSchema
);
