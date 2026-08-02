import mongoose from 'mongoose';
import { UnitModel } from '../../units/models/unit.model';

export async function getPropertyIdFromCreditAccount(
  account: { unitId?: mongoose.Types.ObjectId | null } | null | undefined
): Promise<mongoose.Types.ObjectId | undefined> {
  if (!account?.unitId) return undefined;
  const unit = await UnitModel.findById(account.unitId).select('propertyId').lean();
  const pid = unit?.propertyId;
  return pid ? new mongoose.Types.ObjectId(pid) : undefined;
}
