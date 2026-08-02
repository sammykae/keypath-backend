import mongoose from 'mongoose';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { CreditAccountModel } from '../../ledger/models/creditAccountModel';
import { CreditEventModel } from '../../ledger/models/creditEventModel';
import { CreditEventType } from '../../ledger/types/creditEventTypes';
import { getBalance } from '../../ledger/services/balanceService';
import { Membership } from '../../orgs/models/membership.model';
import { AppError } from '../../../core/errors/AppError';

/** Resolve landlord org: req.auth.orgId or first org where user has OWNER/ADMIN membership (BE-200) */
export async function resolveLandlordOrgId(userId: mongoose.Types.ObjectId): Promise<string> {
  const membership = await Membership.findOne({
    userId,
    status: 'active',
    roleInOrg: { $in: ['OWNER', 'ADMIN'] },
  }).lean();
  if (!membership) {
    throw new AppError('No landlord organization found for user', 403);
  }
  return membership.orgId.toString();
}

export interface LandlordDashboardResult {
  portfolio: {
    properties: number;
    units: number;
    occupied: number;
    occupancyRate: number;
  };
  creditsSummary: {
    totalIssued: number;
    outstanding: number;
  };
  alerts: Array<{ id: string; type: string; message: string; createdAt: string }>;
}

/**
 * GET landlord dashboard — LANDLORD only; org-scoped aggregates (BE-200)
 */
export async function getLandlordDashboard(
  userId: mongoose.Types.ObjectId
): Promise<LandlordDashboardResult> {
  const orgId = await resolveLandlordOrgId(userId);
  const orgOid = new mongoose.Types.ObjectId(orgId);

  const properties = await PropertyModel.find({ orgId: orgOid }).lean();
  const propertyIds = properties.map((p) => (p as any)._id);

  const units = await UnitModel.find({ propertyId: { $in: propertyIds } }).lean();
  const unitIds = units.map((u) => (u as any)._id);

  const occupiedCount = await TenancyModel.countDocuments({
    unitId: { $in: unitIds },
    status: 'ACTIVE',
  });

  const totalUnits = units.length;
  const occupancyRate = totalUnits > 0 ? Math.round((occupiedCount / totalUnits) * 100) : 0;

  const accounts = await CreditAccountModel.find({ orgId: orgOid }).lean();
  const accountIds = accounts.map((a) => (a as any)._id);

  let totalIssued = 0;
  let outstanding = 0;
  if (accountIds.length > 0) {
    const creditEvents = await CreditEventModel.find({
      accountId: { $in: accountIds },
      type: CreditEventType.CREDIT,
    }).lean();
    totalIssued = creditEvents.reduce((s, e) => s + e.amount, 0);
    const balances = await Promise.all(accountIds.map((aid) => getBalance(aid)));
    outstanding = balances.reduce((sum, b) => sum + b, 0);
  }

  const alerts: LandlordDashboardResult['alerts'] = [];

  return {
    portfolio: {
      properties: properties.length,
      units: totalUnits,
      occupied: occupiedCount,
      occupancyRate,
    },
    creditsSummary: { totalIssued, outstanding },
    alerts,
  };
}
