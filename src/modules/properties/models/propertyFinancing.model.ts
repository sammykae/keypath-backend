import mongoose, { Schema, Document } from 'mongoose';

export interface IPropertyFinancing extends Document {
  _id: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  lenderName?: string;
  principal: number;
  outstandingBalance: number;
  interestRate?: number;
  maturityDate: Date;
  type: 'MORTGAGE' | 'LOAN' | 'LINE_OF_CREDIT' | 'OTHER';
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IPropertyFinancing>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    lenderName: { type: String, trim: true },
    principal: { type: Number, required: true, min: 0 },
    outstandingBalance: { type: Number, required: true, min: 0 },
    interestRate: { type: Number, min: 0 },
    maturityDate: { type: Date, required: true },
    type: { type: String, enum: ['MORTGAGE', 'LOAN', 'LINE_OF_CREDIT', 'OTHER'], default: 'MORTGAGE' },
  },
  { timestamps: true, collection: 'property_financing' }
);

export const PropertyFinancingModel = mongoose.model<IPropertyFinancing>('PropertyFinancing', schema);
