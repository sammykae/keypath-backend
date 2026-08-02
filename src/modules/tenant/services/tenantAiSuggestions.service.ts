import mongoose from 'mongoose';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { CreditAccountModel } from '../../ledger/models/creditAccountModel';
import { getBalance } from '../../ledger/services/balanceService';
import { PaymentModel } from '../../payments/models/payment.model';

export interface TenantAiSuggestion {
  text: string;
  type: 'credits' | 'payment' | 'lease' | 'rewards' | 'general';
}

export async function getTenantAiSuggestions(
  tenantUserId: mongoose.Types.ObjectId
): Promise<TenantAiSuggestion[]> {
  const suggestions: TenantAiSuggestion[] = [];

  // Get credit balance
  const accounts = await CreditAccountModel.find({ tenantUserId }).lean();
  let balance = 0;
  for (const acc of accounts as any[]) {
    balance += await getBalance(acc._id);
  }

  // Get recent payments
  const recentPayments = await PaymentModel.find({ tenantUserId })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  // Get tenancy info
  const tenancy = await TenancyModel.findOne({
    tenantUserId,
    status: { $in: ['ACTIVE', 'PENDING'] }
  }).lean();

  // ── Credit-based suggestions ──────────────────────────────────────────────
  if (balance >= 2000) {
    suggestions.push({
      text: `You have ${balance.toLocaleString()} credits — enough to redeem premium perks like Rent Credit or Priority Maintenance.`,
      type: 'credits'
    });
  } else if (balance >= 500) {
    suggestions.push({
      text: `You have ${balance.toLocaleString()} credits. Redeem a Gift Card or save up for a Rent Credit discount.`,
      type: 'rewards'
    });
  } else if (balance > 0) {
    suggestions.push({
      text: `You've earned ${balance.toLocaleString()} credits so far. Pay rent on time each month to build up faster.`,
      type: 'credits'
    });
  } else {
    suggestions.push({
      text: 'Pay rent on time to start earning Ownership Credits you can redeem for perks and rent discounts.',
      type: 'general'
    });
  }

  // ── Payment-based suggestions ─────────────────────────────────────────────
  const paidOnTime = recentPayments.filter(
    (p: any) => p.status === 'PAID' || p.status === 'paid'
  ).length;

  if (paidOnTime >= 3) {
    suggestions.push({
      text: 'Great streak! You\'ve paid on time recently — keep it up to earn bonus credits each month.',
      type: 'payment'
    });
  } else if (recentPayments.length > 0) {
    const late = recentPayments.filter(
      (p: any) => p.status === 'LATE' || p.status === 'late'
    ).length;
    if (late > 0) {
      suggestions.push({
        text: 'Some recent payments were late. On-time payments earn you extra credits — set a reminder before your due date.',
        type: 'payment'
      });
    }
  }

  // ── Lease-based suggestions ───────────────────────────────────────────────
  if (tenancy) {
    const leaseEnd = new Date((tenancy as any).leaseEnd);
    const daysLeft = Math.floor((leaseEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    if (daysLeft > 0 && daysLeft <= 60) {
      suggestions.push({
        text: `Your lease ends in ${daysLeft} days. Contact your landlord to discuss renewal and lock in your earned credits.`,
        type: 'lease'
      });
    } else if (daysLeft > 60 && daysLeft <= 120) {
      suggestions.push({
        text: `Your lease renews in ${daysLeft} days. Early renewal may earn you a bonus credit reward.`,
        type: 'lease'
      });
    }
  }

  return suggestions.slice(0, 3); // max 3 suggestions
}
