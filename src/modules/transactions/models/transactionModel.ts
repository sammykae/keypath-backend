import mongoose, { Schema } from 'mongoose';

const transactionSchema = new Schema({
  event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TokenEvent', required: true },
  counterparty_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['pending', 'completed', 'cancelled'], default: 'pending' },
});

export const TransactionModel = mongoose.model('Transaction', transactionSchema);
