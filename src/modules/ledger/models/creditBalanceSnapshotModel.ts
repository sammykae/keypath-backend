import mongoose, { Schema, Document } from 'mongoose';

export interface CreditBalanceSnapshot extends Document {
  _id: mongoose.Types.ObjectId;
  accountId: mongoose.Types.ObjectId;
  balance: number;
  asOf: Date;
  createdAt: Date;
}

const creditBalanceSnapshotSchema = new Schema<CreditBalanceSnapshot>(
  {
    accountId: { 
      type: Schema.Types.ObjectId, 
      ref: 'CreditAccount', 
      required: true, 
      index: true 
    },
    balance: { 
      type: Number, 
      required: true 
    },
    asOf: { 
      type: Date, 
      required: true,
      index: true
    },
    createdAt: { 
      type: Date, 
      default: Date.now,
      required: true
    }
  },
  { timestamps: false }
);

// Compound index for efficient snapshot queries
creditBalanceSnapshotSchema.index({ accountId: 1, asOf: -1 });

// Index to find latest snapshot for an account
creditBalanceSnapshotSchema.index({ accountId: 1, createdAt: -1 });

export const CreditBalanceSnapshotModel = mongoose.model<CreditBalanceSnapshot>(
  'CreditBalanceSnapshot',
  creditBalanceSnapshotSchema
);
