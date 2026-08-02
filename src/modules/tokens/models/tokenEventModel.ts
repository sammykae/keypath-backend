import mongoose, { Schema } from 'mongoose';

const tokenEventSchema = new Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  property_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  type: { type: String, enum: ['earn', 'contribute', 'sell', 'transfer'], required: true },
  amount: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now },
});

export const TokenEventModel = mongoose.model('TokenEvent', tokenEventSchema);
