/**
 * Credit Event Types
 * Defines all possible types of credit events in the ledger
 */
export enum CreditEventType {
  /** Credit added to account */
  CREDIT = 'CREDIT',
  /** Credit deducted from account */
  DEBIT = 'DEBIT',
  /** Adjustment to correct balance */
  ADJUSTMENT = 'ADJUSTMENT',
  /** Credit expired or voided */
  EXPIRATION = 'EXPIRATION',
  /** Credit transferred to another account */
  TRANSFER_OUT = 'TRANSFER_OUT',
  /** Credit received from another account */
  TRANSFER_IN = 'TRANSFER_IN',
  /** Credit redeemed for value */
  REDEMPTION = 'REDEMPTION',
  /** Credit refunded */
  REFUND = 'REFUND',
}

/**
 * Type guard to check if a string is a valid CreditEventType
 */
export function isCreditEventType(value: string): value is CreditEventType {
  return Object.values(CreditEventType).includes(value as CreditEventType);
}
