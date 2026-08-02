import mongoose, { Schema, Document } from 'mongoose';

export interface Stakeholder extends Document {
  _id: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  type: 'COMMUNITY' | 'INVESTOR';
  name: string;
  contact: {
    email?: string;
    phone?: string;
    address?: {
      line1?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    };
  };
  tokensAllocated: number;
  tokensEarned: number;
  deliverables: Array<{
    title: string;
    dueDate: Date;
    status: 'PENDING' | 'COMPLETED' | 'OVERDUE';
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const deliverableSchema = new Schema(
  {
    title: { type: String, required: true },
    dueDate: { type: Date, required: true },
    status: { 
      type: String, 
      enum: ['PENDING', 'COMPLETED', 'OVERDUE'], 
      required: true,
      default: 'PENDING'
    }
  },
  { _id: false }
);

const contactSchema = new Schema(
  {
    email: { type: String },
    phone: { type: String },
    address: {
      line1: { type: String },
      city: { type: String },
      state: { type: String },
      postalCode: { type: String },
      country: { type: String }
    }
  },
  { _id: false }
);

const stakeholderSchema = new Schema<Stakeholder>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    type: { 
      type: String, 
      enum: ['COMMUNITY', 'INVESTOR'], 
      required: true 
    },
    name: { type: String, required: true },
    contact: { type: contactSchema, required: true },
    tokensAllocated: { type: Number, required: true, default: 0, min: 0 },
    tokensEarned: { type: Number, required: true, default: 0, min: 0 },
    deliverables: { type: [deliverableSchema], default: [] }
  },
  { timestamps: true }
);

// Indexes as specified in guide
stakeholderSchema.index({ orgId: 1, type: 1 });

export const StakeholderModel = mongoose.model<Stakeholder>('Stakeholder', stakeholderSchema);

