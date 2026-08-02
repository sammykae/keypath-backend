import mongoose from 'mongoose';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { resolveLandlordOrgId } from './landlordDashboard.service';
import { AppError } from '../../../core/errors/AppError';

export async function getLandlordPropertyValuation(
  userId: mongoose.Types.ObjectId,
  propertyId: string
) {
  const orgId = await resolveLandlordOrgId(userId);
  const orgOid = new mongoose.Types.ObjectId(orgId);
  const propertyOid = new mongoose.Types.ObjectId(propertyId);

  const property = await PropertyModel.findOne({
    _id: propertyOid,
    orgId: orgOid,
  }).lean();

  if (!property) {
    throw new AppError('Property not found', 404);
  }

  const p = property as any;

  // Use valuationUsd first, fall back to estimatedPropertyValue
  const estimatedValue = p.valuationUsd ?? p.estimatedPropertyValue ?? null;

  // Derive occupancy rate from live tenancy count vs total units
  const units = await UnitModel.find({ propertyId: propertyOid }).lean();
  const totalUnits = p.totalUnits ?? units.length;
  const unitIds = units.map((u: any) => u._id);
  const activeTenancies = await TenancyModel.countDocuments({
    unitId: { $in: unitIds },
    status: 'ACTIVE',
  });
  const occupancyRate = totalUnits > 0 ? Math.round((activeTenancies / totalUnits) * 100) : 0;

  // Derive confidence level from how much data we have
  let confidenceLevel: 'High' | 'Medium' | 'Low' = 'Low';
  if (estimatedValue && totalUnits > 0 && p.tokenizedPct > 0) {
    confidenceLevel = 'High';
  } else if (estimatedValue || totalUnits > 0) {
    confidenceLevel = 'Medium';
  }

  // Growth trend based on tokenized pct and occupancy
  let growthTrend: string = 'N/A';
  if (estimatedValue) {
    const rate = (occupancyRate / 100) * (p.tokenizedPct / 100) * 5;
    const rounded = Math.round(rate * 10) / 10;
    growthTrend = rounded > 0 ? `+${rounded}%` : `${rounded}%`;
  }

  return {
    valuation: {
      estimatedValue,
      growthTrend,
      confidenceLevel,
      occupancyRate,
      tokenizedPct: p.tokenizedPct ?? 0,
      totalUnits,
      source: p.valuationUsd ? 'valuationUsd' : p.estimatedPropertyValue ? 'estimatedPropertyValue' : null,
    },
  };
}
