export type RiskBadge = 'RED' | 'YELLOW' | 'GREEN';

export const RISK_REASONS = {
  INSURANCE_EXPIRED: 'Insurance expired',
  NOTICE_OF_DEFAULT_YES: 'Notice of default Yes',
  MORTGAGE_GT_PROPERTY_VALUE: 'Mortgage > property value',
  OWNERSHIP_PCT_MISMATCH: 'Ownership % mismatch',
  MISSING_REQUIRED_FIELDS: 'Missing required fields',
  COMPLETE_AND_VALID: 'Complete and valid',
} as const;

export interface OnboardingCardInput {
  id: string;
  insuranceExpiryDate?: string | null;
  noticeOfDefault?: boolean | null;
  mortgageAmount?: number | null;
  propertyValue?: number | null;
  ownershipPct?: number | null;
  expectedOwnershipPct?: number | null;
}

export interface CardRiskResult {
  cardId: string;
  badge: RiskBadge;
  reasons: string[];
}

export interface RiskBadgesResponse {
  cards: CardRiskResult[];
  globalBadge: RiskBadge;
}

export const DEFAULT_REQUIRED_CARD_FIELDS: (keyof OnboardingCardInput)[] = [
  'id',
  'insuranceExpiryDate',
  'noticeOfDefault',
  'mortgageAmount',
  'propertyValue',
  'ownershipPct',
  'expectedOwnershipPct',
];
