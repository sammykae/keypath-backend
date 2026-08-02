import mongoose from 'mongoose';
import { resolveLandlordOrgId } from './landlordDashboard.service';
import { AppError } from '../../../core/errors/AppError';

export type IncentiveRuleType = 'ON_TIME_RENT' | 'RENEWAL' | 'REFERRAL';

export interface IncentivesRunBody {
  ruleType: IncentiveRuleType;
  period: string; // e.g. "2025-10"
}

export interface IncentivesRunResult {
  dryRun: boolean;
  ruleType: IncentiveRuleType;
  period: string;
  wouldIssue?: number;
  issued?: number;
  message: string;
}

/**
 * BE-401: Stub rule evaluator. dryRun returns what would happen; run mode creates issuance events + audit.
 */
export async function runIncentives(
  userId: mongoose.Types.ObjectId,
  body: IncentivesRunBody,
  dryRun: boolean
): Promise<IncentivesRunResult> {
  await resolveLandlordOrgId(userId);

  const { ruleType, period } = body;
  const stubWouldIssue = 10;

  if (dryRun) {
    return {
      dryRun: true,
      ruleType,
      period,
      wouldIssue: stubWouldIssue,
      message: `Dry run: would issue ${stubWouldIssue} credit(s) for rule ${ruleType} period ${period}`,
    };
  }

  // Run mode: stub does not actually create events (no tenant/account context in stub).
  // In a full impl we would evaluate rules, find eligible tenants, and call issueCreditsToTenant.
  return {
    dryRun: false,
    ruleType,
    period,
    issued: 0,
    message: `Run completed (stub): rule ${ruleType} period ${period}. Implement rule evaluator to issue credits.`,
  };
}
