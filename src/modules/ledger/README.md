# Ledger Module (BE-300)

Authoritative off-chain ledger primitives for credit account management.

## Quick Start

```typescript
import {
  CreditAccountModel,
  createCreditEventWithIdempotency,
  CreditEventType,
  getBalance
} from './modules/ledger';

// 1. Create a credit account
const account = new CreditAccountModel({
  tenantUserId: userId,
  orgId: orgId, // optional
  unitId: unitId, // optional
});
await account.save();

// 2. Add credit with idempotency
await createCreditEventWithIdempotency(
  {
    accountId: account._id,
    type: CreditEventType.CREDIT,
    amount: 100.00,
    description: 'Monthly rent credit',
  },
  'unique-idempotency-key-123'
);

// 3. Get balance
const balance = await getBalance(account._id);
```

## Module Structure

```
ledger/
├── models/
│   ├── creditAccountModel.ts          # Credit account collection
│   ├── creditEventModel.ts            # Append-only event ledger
│   └── creditBalanceSnapshotModel.ts  # Optional balance cache
├── types/
│   └── creditEventTypes.ts            # Event type enums
├── services/
│   ├── balanceService.ts              # Balance computation
│   └── idempotencyService.ts         # Idempotent event writes
├── index.ts                           # Module exports
├── README.md                          # This file
└── LEDGER_SCENARIO_DESIGN.md         # Detailed design doc
```

## Key Features

- ✅ **Deterministic Balance**: Balance always computed from events
- ✅ **Append-Only Events**: Immutable event ledger
- ✅ **Idempotent Writes**: Safe retry with idempotency keys
- ✅ **Performance Optimized**: Optional balance snapshots

## Collections

### credit_accounts
- `tenantUserId` (required)
- `orgId` (optional)
- `unitId` (optional)
- `createdAt`

### credit_events (Append-Only)
- `accountId` (required)
- `type` (required): CreditEventType enum
- `amount` (required)
- `occurredAt` (required)
- `description` (optional)
- `referenceId` (optional)
- `idempotencyKey` (required, unique)

### credit_balance_snapshots (Optional)
- `accountId` (required)
- `balance` (required)
- `asOf` (required)

## Event Types

- `CREDIT`: Add credit to account
- `DEBIT`: Deduct credit from account
- `ADJUSTMENT`: Correct balance (can be +/-)
- `EXPIRATION`: Credit expired
- `TRANSFER_OUT`: Transfer to another account
- `TRANSFER_IN`: Receive from another account
- `REDEMPTION`: Redeem credit for value
- `REFUND`: Refund previously deducted credit

## API Reference

See `LEDGER_SCENARIO_DESIGN.md` for detailed usage scenarios and examples.
