import mongoose from 'mongoose';
import { PropertyModel } from '../../properties/models/propertyModel';
import { TokenizationConfigModel } from '../../tokenization/models/tokenizationConfigModel';
import { RewardsCampaignModel } from '../../rewardsCampaigns/models/rewardsCampaign.model';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { writeAuditEvent } from '../../audit/services/audit.service';
import { AppError } from '../../../core/errors/AppError';
import { resolveLandlordOrgId } from './landlordDashboard.service';

export async function getLandlordPropertyProgram(
  userId: mongoose.Types.ObjectId,
  propertyId: string
) {
  const orgId = await resolveLandlordOrgId(userId);
  const orgOid = new mongoose.Types.ObjectId(orgId);

  // Verify property belongs to landlord's org
  const property = await PropertyModel.findOne({
    _id: propertyId,
    orgId: orgOid,
  }).lean();

  if (!property) {
    return { program: null };
  }

  const propertyOid = new mongoose.Types.ObjectId(propertyId);

  // Fetch tokenization config
  const tokenizationConfig = await TokenizationConfigModel.findOne({
    propertyId: propertyOid,
  }).lean();

  // Fetch rewards campaign
  const campaign = await RewardsCampaignModel.findOne({
    propertyId: propertyOid,
  }).lean();

  // Fetch units and active tenancies for participation calculation
  const units = await UnitModel.find({ propertyId: propertyOid }).lean();
  const unitIds = units.map((u) => (u as any)._id);

  const activeTenancies = await TenancyModel.countDocuments({
    unitId: { $in: unitIds },
    status: 'ACTIVE',
  });

  const totalUnits = units.length;
  const tenantParticipationRate = totalUnits > 0 ? Math.round((activeTenancies / totalUnits) * 100) : 0;

  // Calculate budget used (placeholder - could be fetched from reward events)
  const budgetAllocated = (campaign as any)?.budget ?? 0;
  const budgetUsed = Math.round(budgetAllocated * 0.54); // 54% used as placeholder

  return {
    program: {
      rewards: campaign
        ? {
            status: 'Active',
            budgetAllocated,
            budgetUsed,
            participationRate: tenantParticipationRate,
          }
        : null,
      equity: tokenizationConfig
        ? {
            status: (property as any)?.activationStatus ?? 'PENDING',
            tokenizedPercentage: (tokenizationConfig as any)?.equityPct ?? 0,
            network: (tokenizationConfig as any)?.network ?? 'none',
            entity: (tokenizationConfig as any)?.entity ?? 'OTHER',
          }
        : null,
    },
  };
}

export async function pauseTokenization(
  userId: mongoose.Types.ObjectId,
  propertyId: string
) {
  const orgId = await resolveLandlordOrgId(userId);
  const orgOid = new mongoose.Types.ObjectId(orgId);
  const propertyOid = new mongoose.Types.ObjectId(propertyId);

  const property = await PropertyModel.findOne({
    _id: propertyOid,
    orgId: orgOid,
  });

  if (!property) {
    throw new AppError('Property not found', 404);
  }

  await PropertyModel.findByIdAndUpdate(
    propertyOid,
    { activationStatus: 'SUSPENDED' },
    { new: true }
  ).lean();

  await writeAuditEvent({
    actorUserId: userId,
    orgId: orgOid,
    action: 'PROPERTY_TOKENIZATION_PAUSED',
    entityType: 'PROPERTY',
    entityId: propertyOid,
    propertyId: propertyOid,
    diff: { before: { activationStatus: (property as any).activationStatus }, after: { activationStatus: 'SUSPENDED' } },
  });

  return { success: true, status: 'SUSPENDED' };
}

export async function resumeTokenization(
  userId: mongoose.Types.ObjectId,
  propertyId: string
) {
  const orgId = await resolveLandlordOrgId(userId);
  const orgOid = new mongoose.Types.ObjectId(orgId);
  const propertyOid = new mongoose.Types.ObjectId(propertyId);

  const property = await PropertyModel.findOne({
    _id: propertyOid,
    orgId: orgOid,
  });

  if (!property) {
    throw new AppError('Property not found', 404);
  }

  await PropertyModel.findByIdAndUpdate(
    propertyOid,
    { activationStatus: 'ACTIVE' },
    { new: true }
  ).lean();

  await writeAuditEvent({
    actorUserId: userId,
    orgId: orgOid,
    action: 'PROPERTY_TOKENIZATION_RESUMED',
    entityType: 'PROPERTY',
    entityId: propertyOid,
    propertyId: propertyOid,
    diff: { before: { activationStatus: (property as any).activationStatus }, after: { activationStatus: 'ACTIVE' } },
  });

  return { success: true, status: 'ACTIVE' };
}
