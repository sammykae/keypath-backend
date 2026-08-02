import mongoose from 'mongoose';
import { PaymentModel, PaymentStatus } from '../models/payment.model';

function parseRangeMonths(range: string): number {
  const match = range.match(/^(\d+)m$/i);
  if (match) return Math.min(24, Math.max(1, parseInt(match[1], 10)));
  return 12;
}

export interface TenantPaymentItem {
  id: string;
  tenancyId?: string;
  period: string;
  amount: number;
  status: 'DUE' | 'PAID' | 'LATE' | 'FAILED';
  dueDate: string;
  paidAt?: string;
  method?: string;
  incentivesEarnedCredits?: number;
  earlyWindowOpen: boolean;
  daysUntilDue: number | null;
  daysOverdue: number | null;
}

function computePaymentFields(
  dbStatus: PaymentStatus,
  dueDate: Date
): Pick<TenantPaymentItem, 'status' | 'earlyWindowOpen' | 'daysUntilDue' | 'daysOverdue'> {
  if (dbStatus === 'PAID' || dbStatus === 'FAILED' || dbStatus === 'REFUNDED') {
    return { status: dbStatus as 'PAID' | 'FAILED', earlyWindowOpen: false, daysUntilDue: null, daysOverdue: null };
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      status: 'LATE',
      earlyWindowOpen: false,
      daysUntilDue: null,
      daysOverdue: Math.abs(diffDays)
    };
  }

  return {
    status: 'DUE',
    earlyWindowOpen: true,
    daysUntilDue: diffDays,
    daysOverdue: null
  };
}

/**
 * Bulk-fix stale DUE payments in DB whose dueDate has already passed.
 * Called on every list request — cheap aggregation + targeted update.
 */
async function syncOverduePayments(tenantUserId: mongoose.Types.ObjectId): Promise<void> {
  await PaymentModel.updateMany(
    { tenantUserId, status: 'DUE', dueDate: { $lt: new Date() } },
    { $set: { status: 'LATE' } }
  );
}

export async function getTenantPayments(
  tenantUserId: mongoose.Types.ObjectId,
  range: string = '12m'
): Promise<{ payments: TenantPaymentItem[] }> {
  const months = parseRangeMonths(range);
  const start = new Date();
  start.setMonth(start.getMonth() - months);
  start.setHours(0, 0, 0, 0);

  // Fix stale DUE → LATE in DB before reading
  await syncOverduePayments(tenantUserId);

  const list = await PaymentModel.find({
    tenantUserId,
    dueDate: { $gte: start }
  })
    .sort({ dueDate: -1 })
    .lean();

  const payments: TenantPaymentItem[] = list.map((p) => {
    const computed = computePaymentFields(p.status, p.dueDate);
    return {
      id: (p as any)._id.toString(),
      ...(p.tenancyId && { tenancyId: p.tenancyId.toString() }),
      period: p.period,
      amount: p.amount,
      dueDate: p.dueDate.toISOString(),
      ...(p.paidAt && { paidAt: (p.paidAt as Date).toISOString() }),
      ...(p.method && { method: p.method }),
      ...(p.incentivesEarnedCredits != null && { incentivesEarnedCredits: p.incentivesEarnedCredits }),
      ...computed
    };
  });

  return { payments };
}
