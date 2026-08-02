# Ledger Scenario Design Document

## Overview

This document describes the design and usage scenarios for the authoritative off-chain ledger primitives (BE-300).

## Architecture

### Collections

#### 1. credit_accounts
Represents a credit account for a tenant user, optionally scoped to an organization and/or unit.

**Schema:**
- `tenantUserId` (required): Reference to the tenant user
- `orgId` (optional): Reference to the organization
- `unitId` (optional): Reference to the unit
- `createdAt` (required): Account creation timestamp

**Indexes:**
- Unique compound index on `(tenantUserId, orgId, unitId)` to prevent duplicate accounts

#### 2. credit_events (Append-Only)
Immutable ledger of all credit changes. This is the source of truth for all balance calculations.

**Schema:**
- `accountId` (required): Reference to the credit account
- `type` (required): Type of event (CREDIT, DEBIT, ADJUSTMENT, etc.)
- `amount` (required): Amount of credit change
- `occurredAt` (required): When the event occurred
- `description` (optional): Human-readable description
- `referenceId` (optional): Reference to related entity (e.g., transaction, order)
- `idempotencyKey` (required): Unique key to ensure idempotent writes
- `createdAt` (required): Event creation timestamp

**Indexes:**
- Unique index on `idempotencyKey` for idempotency enforcement
- Compound index on `(accountId, occurredAt)` for efficient balance queries
- Index on `referenceId` for reference lookups

#### 3. credit_balance_snapshots (Optional)
Performance optimization cache for account balances. Not required for correctness.

**Schema:**
- `accountId` (required): Reference to the credit account
- `balance` (required): Balance at snapshot time
- `asOf` (required): Timestamp of the snapshot
- `createdAt` (required): Snapshot creation timestamp

**Indexes:**
- Compound index on `(accountId, asOf)` for efficient snapshot queries
- Compound index on `(accountId, createdAt)` for finding latest snapshot

## Key Design Principles

### 1. Deterministic Balance Computation
- Balance is **always** derived from events, never stored directly
- Balance computation is deterministic: same events = same balance
- Snapshots are optional performance optimizations, not source of truth

### 2. Append-Only Events
- Events are immutable once created
- No updates or deletes allowed on credit_events
- Corrections are made via new ADJUSTMENT events

### 3. Idempotent Writes
- Every event write requires an `idempotencyKey`
- Same key + same data = returns existing event
- Same key + different data = error (data integrity violation)

### 4. Event Types

| Type | Effect on Balance | Use Case |
|------|------------------|----------|
| CREDIT | +amount | Adding credit to account |
| DEBIT | -amount | Deducting credit from account |
| ADJUSTMENT | +amount (can be negative) | Correcting balance errors |
| EXPIRATION | -amount | Credit expired or voided |
| TRANSFER_OUT | -amount | Transferring credit to another account |
| TRANSFER_IN | +amount | Receiving credit from another account |
| REDEMPTION | -amount | Redeeming credit for value |
| REFUND | +amount | Refunding previously deducted credit |

## Usage Scenarios

### Scenario 1: Creating a Credit Account

```typescript
import { CreditAccountModel } from './modules/ledger';

const account = new CreditAccountModel({
  tenantUserId: userId,
  orgId: orgId, // optional
  unitId: unitId, // optional
});

await account.save();
```

### Scenario 2: Adding Credit with Idempotency

```typescript
import { 
  createCreditEventWithIdempotency,
  CreditEventType 
} from './modules/ledger';

const result = await createCreditEventWithIdempotency(
  {
    accountId: account._id,
    type: CreditEventType.CREDIT,
    amount: 100.00,
    description: 'Monthly rent credit',
    referenceId: rentPaymentId,
  },
  `rent_credit_${rentPaymentId}_${month}`
);

if (result.isNew) {
  console.log('New credit event created');
} else {
  console.log('Existing event returned (idempotent)');
}
```

### Scenario 3: Computing Balance

```typescript
import { computeBalance, getBalance } from './modules/ledger';

// Full computation from all events
const balance = await computeBalance(accountId);

// Optimized: uses snapshot if recent, otherwise computes from events
const optimizedBalance = await getBalance(accountId, true, 3600000); // 1 hour max age
```

### Scenario 4: Redeeming Credit

```typescript
import { 
  createCreditEventWithIdempotency,
  CreditEventType,
  getBalance 
} from './modules/ledger';

// Check balance first
const balance = await getBalance(accountId);
if (balance < redemptionAmount) {
  throw new Error('Insufficient credit');
}

// Create redemption event
await createCreditEventWithIdempotency(
  {
    accountId: accountId,
    type: CreditEventType.REDEMPTION,
    amount: redemptionAmount,
    description: 'Redeemed for discount',
    referenceId: orderId,
  },
  `redemption_${orderId}`
);
```

### Scenario 5: Correcting Balance Error

```typescript
import { 
  createCreditEventWithIdempotency,
  CreditEventType,
  computeBalance 
} from './modules/ledger';

// Compute current balance
const currentBalance = await computeBalance(accountId);
const correctBalance = 150.00;
const adjustment = correctBalance - currentBalance;

// Create adjustment event
await createCreditEventWithIdempotency(
  {
    accountId: accountId,
    type: CreditEventType.ADJUSTMENT,
    amount: adjustment, // Can be positive or negative
    description: 'Balance correction',
  },
  `adjustment_${Date.now()}`
);
```

### Scenario 6: Transferring Credit Between Accounts

```typescript
import { 
  createCreditEventWithIdempotency,
  CreditEventType 
} from './modules/ledger';

const transferId = new mongoose.Types.ObjectId();
const idempotencyKey = `transfer_${transferId}`;

// Debit from source account
await createCreditEventWithIdempotency(
  {
    accountId: sourceAccountId,
    type: CreditEventType.TRANSFER_OUT,
    amount: transferAmount,
    description: `Transfer to account ${targetAccountId}`,
    referenceId: transferId,
  },
  `${idempotencyKey}_out`
);

// Credit to target account
await createCreditEventWithIdempotency(
  {
    accountId: targetAccountId,
    type: CreditEventType.TRANSFER_IN,
    amount: transferAmount,
    description: `Transfer from account ${sourceAccountId}`,
    referenceId: transferId,
  },
  `${idempotencyKey}_in`
);
```

### Scenario 7: Creating Balance Snapshot (Performance Optimization)

```typescript
import { createBalanceSnapshot } from './modules/ledger';

// Create snapshot for accounts with many events
// This can be done periodically via a background job
await createBalanceSnapshot(accountId);
```

## Acceptance Criteria Verification

### ✅ Balance can be derived deterministically from events
- `computeBalance()` function sums all events in chronological order
- Same events always produce same balance
- No balance is stored directly in credit_accounts

### ✅ Every credit change creates credit_event
- All balance changes must go through `createCreditEventWithIdempotency()`
- No direct balance updates allowed
- Event types cover all balance change scenarios

### ✅ Idempotent writes supported
- `idempotencyKey` is required for all events
- Unique index enforces key uniqueness
- Service layer handles duplicate key scenarios gracefully
- Returns existing event if key already exists with matching data

## Performance Considerations

1. **Balance Computation**: For accounts with many events, use `getBalance()` with snapshots enabled
2. **Snapshot Strategy**: Create snapshots periodically (e.g., daily) for high-activity accounts
3. **Indexes**: All queries are optimized with appropriate indexes
4. **Event Queries**: Use `occurredAt` for time-based queries, not `createdAt`

## Error Handling

- **Idempotency Conflicts**: Throws error if same key used with different data
- **Insufficient Balance**: Check balance before debits/redemptions
- **Invalid Event Type**: TypeScript enum prevents invalid types
- **Missing Account**: Ensure account exists before creating events

## Future Enhancements

1. **Event Replay**: Ability to replay events for audit/debugging
2. **Balance History**: Track balance over time for analytics
3. **Event Filtering**: Query events by type, date range, etc.
4. **Batch Operations**: Create multiple events atomically
5. **Event Validation**: Business rules validation before event creation
