/**
 * Ledger Module
 * Authoritative off-chain ledger primitives for credit account management
 * 
 * This module provides:
 * - Credit account management
 * - Append-only credit event ledger
 * - Deterministic balance computation
 * - Idempotent event writes
 * - Optional balance snapshots for performance
 */

// Models
export { CreditAccountModel, type CreditAccount } from './models/creditAccountModel';
export { CreditEventModel, type CreditEvent } from './models/creditEventModel';
export {
  UnifiedLedgerEntryModel,
  type UnifiedLedgerEntry,
} from './models/unifiedLedgerEntry.model';
export { CreditBalanceSnapshotModel, type CreditBalanceSnapshot } from './models/creditBalanceSnapshotModel';

// Types
export { CreditEventType, isCreditEventType } from './types/creditEventTypes';
export {
  LedgerKind,
  RewardLedgerEventType,
  OwnershipLedgerEventType,
} from './types/unifiedLedgerTypes';

// Services
export {
  computeBalance,
  getBalance,
  createBalanceSnapshot
} from './services/balanceService';

export {
  createCreditEventWithIdempotency,
  generateIdempotencyKey,
  type IdempotentWriteResult
} from './services/idempotencyService';

export {
  appendOwnershipLedgerEntry,
  listUnifiedEntriesForTenant,
  reconcileUnifiedBalancesForTenant,
  syncUnifiedLedgerFromCreditEvent,
} from './services/unifiedLedger.service';

// Controllers (for route handlers)
export {
  getOwnershipCreditsHandler,
  listUnifiedLedgerEntriesHandler,
  reconcileUnifiedLedgerHandler,
} from './controllers/ledgerController';
