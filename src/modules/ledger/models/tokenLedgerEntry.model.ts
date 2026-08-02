import mongoose, { Document, Schema } from "mongoose";

export enum TokenLedgerEntryType {
  ACCRUAL = "accrual",
  PURCHASE = "purchase",
  ADJUSTMENT = "adjustment",
  FORFEIT = "forfeit",
  // TEPA workflow event types (Backend Canon / dashboard spec).
  VESTING = "vesting",
  VALUATION_UPDATE = "valuation_update",
  LIQUIDITY_REQUEST = "liquidity_request",
  APPROVED_DEDUCTION = "approved_deduction",
  CORRECTION = "correction",
  TRANSFER_REQUEST = "transfer_request",
  // P1 - TEPA Equity Credits / Token Ledger, NEW: previously PURCHASE covered both
  // the monthly and one-off cases; ACCRUAL covered both time-based accrual and
  // manually-granted incentives. These give each its own event type/ledger label.
  SPOT_PURCHASE = "spot_purchase",
  INCENTIVE_TOKEN = "incentive_token",
  VESTED_TOKEN_PAYMENT_RIGHT = "vested_token_payment_right",
}

export interface TokenLedgerEntry extends Document {
  _id: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  type: TokenLedgerEntryType;
  tokens: number;
  value?: number;
  timestamp: Date;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

const tokenLedgerEntrySchema = new Schema<TokenLedgerEntry>(
  {
    propertyId: { type: Schema.Types.ObjectId, ref: "Property", required: true, index: true },
    tenantId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: Object.values(TokenLedgerEntryType),
      required: true,
      index: true,
    },
    tokens: { type: Number, required: true },
    value: { type: Number, required: false },
    timestamp: { type: Date, required: true, default: Date.now, index: true },
    source: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

tokenLedgerEntrySchema.index({ tenantId: 1, timestamp: -1 });
tokenLedgerEntrySchema.index({ propertyId: 1, timestamp: -1 });
tokenLedgerEntrySchema.index(
  { propertyId: 1, tenantId: 1, type: 1, tokens: 1, value: 1, timestamp: 1, source: 1 },
  { unique: true, name: "uniq_ledger_event_fingerprint" }
);

export const TokenLedgerEntryModel = mongoose.model<TokenLedgerEntry>(
  "TokenLedgerEntry",
  tokenLedgerEntrySchema
);
