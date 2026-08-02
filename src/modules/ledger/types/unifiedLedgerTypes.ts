/**
 * BE-204 / BE-210 — unified append-only token ledger (rewards + TEPA ownership).
 */
export const LedgerKind = {
  REWARD: 'REWARD',
  OWNERSHIP: 'OWNERSHIP',
} as const;
export type LedgerKind = (typeof LedgerKind)[keyof typeof LedgerKind];

/** Business-facing reward event labels (immutable log). */
export const RewardLedgerEventType = {
  LANDLORD_CREDIT_EARN: 'LANDLORD_CREDIT_EARN',
  LANDLORD_CREDIT_ADJUST: 'LANDLORD_CREDIT_ADJUST',
  REWARD_REDEMPTION: 'REWARD_REDEMPTION',
  CREDIT_GENERIC: 'CREDIT_GENERIC',
  DEBIT_GENERIC: 'DEBIT_GENERIC',
  ADJUSTMENT: 'ADJUSTMENT',
  TRANSFER_IN: 'TRANSFER_IN',
  TRANSFER_OUT: 'TRANSFER_OUT',
  EXPIRATION: 'EXPIRATION',
  REFUND: 'REFUND',
} as const;
export type RewardLedgerEventType =
  (typeof RewardLedgerEventType)[keyof typeof RewardLedgerEventType];

/** TEPA / property-scoped ownership token movements. */
export const OwnershipLedgerEventType = {
  TEPA_RENT_ACCRUAL: 'TEPA_RENT_ACCRUAL',
  TEPA_BONUS: 'TEPA_BONUS',
  TEPA_REDEMPTION: 'TEPA_REDEMPTION',
  TEPA_CORRECTION: 'TEPA_CORRECTION',
} as const;
export type OwnershipLedgerEventType =
  (typeof OwnershipLedgerEventType)[keyof typeof OwnershipLedgerEventType];
