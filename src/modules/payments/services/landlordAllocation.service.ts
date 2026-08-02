import mongoose from 'mongoose';
import { LandlordAllocationModel } from '../models/landlordAllocation.model';

const PLATFORM_FEE_RATE = Number(process.env.PLATFORM_FEE_RATE || '0.05'); // 5% default
const STRIPE_CURRENCY = (process.env.STRIPE_CURRENCY || 'usd').toLowerCase();

export interface AllocationResult {
  allocationId: string;
  grossAmount: number;
  platformFee: number;
  netAmount: number;
  alreadyExists: boolean;
}

/**
 * Records landlord allocation when a tenant payment is confirmed PAID.
 * Idempotent: one allocation per paymentId (unique index).
 *
 * Flow: grossAmount - platformFee = netAmount owed to landlord org.
 * Status starts as PENDING until funds are settled (Stripe Connect or manual).
 */
export async function createLandlordAllocation(input: {
  paymentId: mongoose.Types.ObjectId;
  tenantUserId: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  unitId: mongoose.Types.ObjectId;
  period: string;
  grossAmount: number;
}): Promise<AllocationResult> {
  const existing = await LandlordAllocationModel.findOne({ paymentId: input.paymentId }).lean();
  if (existing) {
    return {
      allocationId: existing._id.toString(),
      grossAmount: existing.grossAmount,
      platformFee: existing.platformFee,
      netAmount: existing.netAmount,
      alreadyExists: true,
    };
  }

  const platformFee = parseFloat((input.grossAmount * PLATFORM_FEE_RATE).toFixed(2));
  const netAmount = parseFloat((input.grossAmount - platformFee).toFixed(2));

  const doc = await LandlordAllocationModel.create({
    paymentId: input.paymentId,
    tenantUserId: input.tenantUserId,
    orgId: input.orgId,
    propertyId: input.propertyId,
    unitId: input.unitId,
    period: input.period,
    grossAmount: input.grossAmount,
    platformFee,
    netAmount,
    currency: STRIPE_CURRENCY,
    status: 'PENDING',
  });

  return {
    allocationId: doc._id.toString(),
    grossAmount: doc.grossAmount,
    platformFee: doc.platformFee,
    netAmount: doc.netAmount,
    alreadyExists: false,
  };
}

export async function getLandlordAllocationSummary(
  orgId: mongoose.Types.ObjectId,
  filters: { period?: string; status?: 'PENDING' | 'SETTLED' } = {}
) {
  const match: Record<string, unknown> = { orgId };
  if (filters.period) match.period = filters.period;
  if (filters.status) match.status = filters.status;

  const rows = await LandlordAllocationModel.aggregate<{
    _id: string;
    count: number;
    totalGross: number;
    totalFee: number;
    totalNet: number;
  }>([
    { $match: match },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalGross: { $sum: '$grossAmount' },
        totalFee: { $sum: '$platformFee' },
        totalNet: { $sum: '$netAmount' },
      },
    },
  ]);

  const summary = { PENDING: { count: 0, totalGross: 0, totalFee: 0, totalNet: 0 }, SETTLED: { count: 0, totalGross: 0, totalFee: 0, totalNet: 0 } };
  for (const row of rows) {
    if (row._id === 'PENDING' || row._id === 'SETTLED') {
      summary[row._id] = { count: row.count, totalGross: row.totalGross, totalFee: row.totalFee, totalNet: row.totalNet };
    }
  }

  return summary;
}
