import mongoose, { Schema, Document } from 'mongoose';

export type ServiceType = 'PRIORITY_MAINTENANCE' | 'CLEANING';
export type ServiceRequestStatus = 'PENDING' | 'FULFILLED' | 'CANCELLED';

export interface IServiceRequest extends Document {
  _id: mongoose.Types.ObjectId;
  tenantUserId: mongoose.Types.ObjectId;
  redemptionId: mongoose.Types.ObjectId;
  serviceType: ServiceType;
  status: ServiceRequestStatus;
  notes?: string;
  fulfilledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IServiceRequest>(
  {
    tenantUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    redemptionId: { type: Schema.Types.ObjectId, ref: 'Redemption', required: true, index: true },
    serviceType:  { type: String, enum: ['PRIORITY_MAINTENANCE', 'CLEANING'], required: true, index: true },
    status:       { type: String, enum: ['PENDING', 'FULFILLED', 'CANCELLED'], default: 'PENDING', index: true },
    notes:        { type: String },
    fulfilledAt:  { type: Date },
  },
  { timestamps: true, collection: 'serviceRequests' }
);

schema.index({ tenantUserId: 1, status: 1 });

export const ServiceRequestModel = mongoose.model<IServiceRequest>('ServiceRequest', schema);
