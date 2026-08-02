import mongoose, { Schema, Document } from 'mongoose';
import { LedgerKind } from '../types/unifiedLedgerTypes';

export interface UnifiedLedgerEntry extends Document {
  _id: mongoose.Types.ObjectId;
  ledgerKind: LedgerKind;
  /** Business event type (REWARD.* or OWNERSHIP.* taxonomy). */
  eventType: string;
  /** Canonical time for ordering and UI (BE-204). */
  timestamp: Date;
  orgId?: mongoose.Types.ObjectId;
  tenantUserId: mongoose.Types.ObjectId;
  propertyId?: mongoose.Types.ObjectId;
  unitId?: mongoose.Types.ObjectId;
  /** Signed delta: positive adds, negative subtracts (per-kind balance reconstruction). */
  signedAmount: number;
  creditAccountId?: mongoose.Types.ObjectId;
  creditEventId?: mongoose.Types.ObjectId;
  /** Idempotency for unified writes (distinct from CreditEvent idempotency key). */
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const unifiedLedgerEntrySchema = new Schema<UnifiedLedgerEntry>(
  {
    ledgerKind: {
      type: String,
      enum: Object.values(LedgerKind),
      required: true,
      index: true,
    },
    eventType: { type: String, required: true, index: true },
    timestamp: { type: Date, required: true, index: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
    tenantUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', index: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', index: true },
    signedAmount: { type: Number, required: true },
    creditAccountId: { type: Schema.Types.ObjectId, ref: 'CreditAccount', index: true },
    creditEventId: { type: Schema.Types.ObjectId, ref: 'CreditEvent', index: true },
    idempotencyKey: { type: String, required: true, unique: true },
    metadata: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now, required: true },
  },
  { timestamps: false }
);

unifiedLedgerEntrySchema.index({ tenantUserId: 1, ledgerKind: 1, timestamp: -1, _id: -1 });
unifiedLedgerEntrySchema.index({ orgId: 1, tenantUserId: 1, timestamp: -1 });

const blockMutate = function (this: mongoose.Query<unknown, unknown>) {
  const op = (this as unknown as { op?: string }).op;
  if (op && ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany'].includes(op)) {
    throw new Error('Unified ledger entries are append-only and cannot be modified or deleted');
  }
};

unifiedLedgerEntrySchema.pre('findOneAndUpdate', blockMutate);
unifiedLedgerEntrySchema.pre('updateOne', blockMutate);
unifiedLedgerEntrySchema.pre('updateMany', blockMutate);
unifiedLedgerEntrySchema.pre('replaceOne', blockMutate);
unifiedLedgerEntrySchema.pre('findOneAndDelete', blockMutate);
unifiedLedgerEntrySchema.pre('deleteOne', blockMutate);
unifiedLedgerEntrySchema.pre('deleteMany', blockMutate);

export const UnifiedLedgerEntryModel = mongoose.model<UnifiedLedgerEntry>(
  'UnifiedLedgerEntry',
  unifiedLedgerEntrySchema
);
