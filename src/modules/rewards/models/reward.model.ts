import mongoose, { Schema, Document } from 'mongoose';

export interface IReward extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  creditCost: number;
  orgId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const rewardSchema = new Schema<IReward>(
  {
    name: { type: String, required: true },
    creditCost: { type: Number, required: true, min: 0 },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
  },
  { timestamps: true }
);

export const RewardModel = mongoose.model<IReward>('Reward', rewardSchema);
