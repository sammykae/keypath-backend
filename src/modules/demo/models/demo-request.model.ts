import mongoose, { Document, Schema } from 'mongoose';

export type DemoRequestInterest =
  | 'LANDLORD_PROPERTY_OWNER'
  | 'TENANT'
  | 'INVESTOR'
  | 'COMMUNITY_STAKEHOLDER'
  | 'OTHER';

export interface IDemoRequest extends Document {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  titleOrRole: string;
  companyOrOrganization: string;
  interestedAs: DemoRequestInterest;
  inquiryNotes?: string;
  notificationStatus: 'PENDING' | 'SENT' | 'FAILED';
  notificationSentAt?: Date | null;
  notificationError?: string | null;
  reviewStatus: 'PENDING' | 'SCHEDULED' | 'ARCHIVED';
  createdAt?: Date;
  updatedAt?: Date;
}

const DemoRequestSchema = new Schema<IDemoRequest>(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    phoneNumber: { type: String, required: true, trim: true },
    titleOrRole: { type: String, required: true, trim: true },
    companyOrOrganization: { type: String, required: true, trim: true },
    interestedAs: {
      type: String,
      required: true,
      enum: [
        'LANDLORD_PROPERTY_OWNER',
        'TENANT',
        'INVESTOR',
        'COMMUNITY_STAKEHOLDER',
        'OTHER',
      ],
      index: true,
    },
    inquiryNotes: { type: String, required: false, trim: true },
    notificationStatus: {
      type: String,
      required: true,
      enum: ['PENDING', 'SENT', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    notificationSentAt: { type: Date, required: false, default: null },
    notificationError: { type: String, required: false, default: null },
    reviewStatus: {
      type: String,
      required: true,
      enum: ['PENDING', 'SCHEDULED', 'ARCHIVED'],
      default: 'PENDING',
      index: true,
    },
  },
  { timestamps: true, collection: 'demo_requests' }
);

DemoRequestSchema.index({ createdAt: -1 });
DemoRequestSchema.index({ email: 1, createdAt: -1 });

export const DemoRequestModel = mongoose.model<IDemoRequest>(
  'DemoRequest',
  DemoRequestSchema
);
