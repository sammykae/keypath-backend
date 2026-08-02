import { Schema, model, Types, HydratedDocument } from 'mongoose';

export type TepaStatus = 'ACTIVE' | 'REVOKED';

export interface ITepaEnrollment {
  tenantUserId: Types.ObjectId;
  unitId: Types.ObjectId;
  status: TepaStatus;
  effectiveDate: Date;
  consentVersion: string;
  acceptedAt: Date;
  createdAt: Date;
}

const TepaEnrollmentSchema = new Schema<ITepaEnrollment>(
  {
    tenantUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    unitId: {
      type: Schema.Types.ObjectId,
      ref: 'Unit',
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ['ACTIVE', 'REVOKED'],
      required: true,
      index: true,
    },

    effectiveDate: {
      type: Date,
      required: true,
    },

    consentVersion: {
      type: String,
      required: true,
    },

    acceptedAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

/**
 * Enforce ONLY ONE ACTIVE enrollment per (tenant + unit)
 */
TepaEnrollmentSchema.index(
  { tenantUserId: 1, unitId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'ACTIVE' },
  }
);

export type TepaEnrollmentDocument = HydratedDocument<ITepaEnrollment>;
export const TepaEnrollment = model<ITepaEnrollment>(
  'TepaEnrollment',
  TepaEnrollmentSchema
);
