import mongoose from 'mongoose';
import { SearchLogModel, IClickedResult } from '../models/search-log.model';

export async function logSearch(data: {
  userId: string;
  query: string;
  role: string;
  resultsCount: number;
}): Promise<string> {
  const doc = await SearchLogModel.create({
    userId: new mongoose.Types.ObjectId(data.userId),
    query: data.query.toLowerCase().trim(),
    role: data.role,
    resultsCount: data.resultsCount,
    timestamp: new Date(),
  });
  return String(doc._id);
}

export async function logClick(logId: string, clicked: IClickedResult): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(logId)) return;
  await SearchLogModel.findByIdAndUpdate(logId, { $set: { clickedResult: clicked } });
}
