import type {
  RiskBadge,
  OnboardingCardInput,
  CardRiskResult,
  RiskBadgesResponse,
} from '../types/riskBadge.types';
import { RISK_REASONS, DEFAULT_REQUIRED_CARD_FIELDS } from '../types/riskBadge.types';

function isExpiredDate(isoDate: string | null | undefined): boolean {
  if (isoDate == null || isoDate === '') return false;
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return false;
  date.setHours(23, 59, 59, 999);
  return date.getTime() < Date.now();
}

function hasMissingRequiredFields(
  card: OnboardingCardInput,
  requiredKeys: (keyof OnboardingCardInput)[]
): boolean {
  for (const key of requiredKeys) {
    if (key === 'id') continue;
    const value = card[key];
    if (value === undefined || value === null) return true;
    if (typeof value === 'string' && value.trim() === '') return true;
  }
  return false;
}

export function evaluateCardRisk(
  card: OnboardingCardInput,
  requiredFieldKeys: (keyof OnboardingCardInput)[] = DEFAULT_REQUIRED_CARD_FIELDS
): CardRiskResult {
  const reasons: string[] = [];

  if (isExpiredDate(card.insuranceExpiryDate)) {
    reasons.push(RISK_REASONS.INSURANCE_EXPIRED);
  }
  if (card.noticeOfDefault === true) {
    reasons.push(RISK_REASONS.NOTICE_OF_DEFAULT_YES);
  }
  const mortgage = card.mortgageAmount ?? 0;
  const propVal = card.propertyValue ?? 0;
  if (mortgage > 0 && propVal > 0 && mortgage > propVal) {
    reasons.push(RISK_REASONS.MORTGAGE_GT_PROPERTY_VALUE);
  }
  const ownership = card.ownershipPct ?? null;
  const expected = card.expectedOwnershipPct ?? null;
  if (ownership != null && expected != null) {
    const mismatch = Math.abs(Number(ownership) - Number(expected)) > 0.01;
    if (mismatch) {
      reasons.push(RISK_REASONS.OWNERSHIP_PCT_MISMATCH);
    }
  }

  let badge: RiskBadge;
  if (reasons.length > 0) {
    badge = 'RED';
  } else if (hasMissingRequiredFields(card, requiredFieldKeys)) {
    badge = 'YELLOW';
    reasons.push(RISK_REASONS.MISSING_REQUIRED_FIELDS);
  } else {
    badge = 'GREEN';
    reasons.push(RISK_REASONS.COMPLETE_AND_VALID);
  }

  return { cardId: card.id, badge, reasons };
}

function badgePriority(b: RiskBadge): number {
  switch (b) {
    case 'RED': return 3;
    case 'YELLOW': return 2;
    case 'GREEN': return 1;
    default: return 0;
  }
}

export function evaluateRiskBadges(
  cards: OnboardingCardInput[],
  requiredFieldKeys?: (keyof OnboardingCardInput)[]
): RiskBadgesResponse {
  const results: CardRiskResult[] = cards.map((card) =>
    evaluateCardRisk(card, requiredFieldKeys)
  );
  const globalBadge: RiskBadge =
    results.length === 0
      ? 'GREEN'
      : results.reduce<RiskBadge>(
          (worst, r) => (badgePriority(r.badge) > badgePriority(worst) ? r.badge : worst),
          'GREEN'
        );
  return { cards: results, globalBadge };
}
