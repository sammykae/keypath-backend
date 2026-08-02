import mongoose, { Schema, Document } from 'mongoose';
import { CreditEventType } from '../types/creditEventTypes';

export interface CreditEvent extends Document {
  _id: mongoose.Types.ObjectId;
  accountId: mongoose.Types.ObjectId;
  type: CreditEventType;
  amount: number;
  occurredAt: Date;
  description?: string;
  referenceId?: mongoose.Types.ObjectId;
  idempotencyKey: string;
  createdAt: Date;
}

const creditEventSchema = new Schema<CreditEvent>(
  {
    accountId: { 
      type: Schema.Types.ObjectId, 
      ref: 'CreditAccount', 
      required: true, 
      index: true 
    },
    type: { 
      type: String, 
      enum: Object.values(CreditEventType), 
      required: true,
      index: true
    },
    amount: { 
      type: Number, 
      required: true 
    },
    occurredAt: { 
      type: Date, 
      required: true, 
      default: Date.now,
      index: true
    },
    description: { 
      type: String 
    },
    referenceId: { 
      type: Schema.Types.ObjectId
    },
    idempotencyKey: { 
      type: String, 
      required: true
    },
    createdAt: { 
      type: Date, 
      default: Date.now,
      required: true
    }
  },
  { timestamps: false }
);

// Compound index for efficient event queries by account and time
creditEventSchema.index({ accountId: 1, occurredAt: -1 });

// Unique index for idempotency - ensures same key can't be used twice
creditEventSchema.index({ idempotencyKey: 1 }, { unique: true });

// Index for reference lookups
creditEventSchema.index({ referenceId: 1 });

const blockCreditMutate = function (this: mongoose.Query<unknown, unknown>) {
  const op = (this as unknown as { op?: string }).op;
  if (
    op &&
    ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany'].includes(op)
  ) {
    throw new Error('Credit events are immutable (append-only ledger)');
  }
};

creditEventSchema.pre('findOneAndUpdate', blockCreditMutate);
creditEventSchema.pre('updateOne', blockCreditMutate);
creditEventSchema.pre('updateMany', blockCreditMutate);
creditEventSchema.pre('replaceOne', blockCreditMutate);
creditEventSchema.pre('findOneAndDelete', blockCreditMutate);
creditEventSchema.pre('deleteOne', blockCreditMutate);
creditEventSchema.pre('deleteMany', blockCreditMutate);

export const CreditEventModel = mongoose.model<CreditEvent>('CreditEvent', creditEventSchema);
