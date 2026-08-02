# KeyPath Payment Lifecycle

Architecture and implementation reference for the Stripe payment integration.

> **MVP Model:** All payments settle into the KeyPath Stripe account. Landlord allocation is tracked internally via the ledger. No direct Stripe payout routing to landlords yet.

---

## 1. Payment Lifecycle

### States

```
DUE → PAID → REFUNDED
    ↘ FAILED
    ↘ LATE
```

| Status | Meaning |
|---|---|
| `DUE` | Payment record created, awaiting tenant payment |
| `PAID` | Stripe confirmed payment; credits accrued; landlord allocation recorded |
| `LATE` | Past due date, still unpaid (set manually or via scheduled job) |
| `FAILED` | Stripe payment attempt failed |
| `REFUNDED` | Stripe issued a refund; credits reversed; allocation voided |

### Full Flow

```
1. Tenant calls POST /api/stripe/create-payment-intent
      │
      ├── Stripe Customer find or create (stored on User.stripeCustomerId)
      ├── Payment record created in MongoDB  (status: DUE)
      └── Stripe PaymentIntent created
            │
            └── clientSecret returned to frontend

2. Frontend confirms payment via Stripe.js (card, wallet, etc.)

3. Stripe fires webhook: payment_intent.succeeded
      │
      ├── StripeWebhookEvent saved (idempotency guard)
      ├── Payment status → PAID, paidAt set
      ├── Ownership credits accrued to tenant credit ledger  (CreditEvent: CREDIT)
      ├── Token ledger entry created  (TokenLedgerEntry: PURCHASE, idempotent by source key)
      └── LandlordAllocation created  (status: PENDING, netAmount = gross - 5% fee)

4. [Future] Stripe Connect transfer / manual settlement
      └── LandlordAllocation status → SETTLED
```

---

## 2. Webhook Events Used

| Stripe Event | Handler | Action |
|---|---|---|
| `payment_intent.succeeded` | `markPaymentPaidAndAccrueTokens` | Mark PAID, accrue credits, create landlord allocation |
| `payment_intent.payment_failed` | `markPaymentFailed` | Mark FAILED |
| `payment_failed` | `markPaymentFailed` | Fallback for charge-level failure events |
| `charge.refunded` | `markPaymentRefunded` | Mark REFUNDED, reverse credits, void allocation |

All webhook events are deduplicated via `stripeWebhookEvents` collection. Duplicate events return `{ duplicate: true }` without re-processing. Failed events (`status: FAILED`) are retried on the next delivery attempt from Stripe.

### Webhook endpoint

```
POST /api/stripe/webhook
```

Protected by `Stripe-Signature` header verification using `STRIPE_WEBHOOK_SECRET`.

---

## 3. Database Collections Affected

### `payments`

Primary payment record. Created on `create-payment-intent`, updated on each webhook event.

| Field | Type | Notes |
|---|---|---|
| `tenantUserId` | ObjectId | Ref: users |
| `orgId` | ObjectId | Landlord's org |
| `propertyId` | ObjectId | Ref: properties |
| `unitId` | ObjectId | Ref: units |
| `tenancyId` | ObjectId | Ref: tenancies |
| `period` | String | `YYYY-MM` billing period |
| `amount` | Number | Major currency units (e.g. `1200` = $1,200) |
| `type` | Enum | `RENT` \| `TOKEN_PURCHASE` |
| `status` | Enum | `DUE` \| `PAID` \| `LATE` \| `FAILED` \| `REFUNDED` |
| `stripePaymentIntentId` | String | Set after PaymentIntent created |
| `incentivesEarnedCredits` | Number | Ownership credits accrued on PAID |
| `paidAt` | Date | Set on PAID |
| `refundedAt` | Date | Set on REFUNDED |
| `refundAmount` | Number | Refunded amount in major units |

Unique index: `{ tenantUserId, period, type }` — one payment per tenant per period per type.

---

### `landlordAllocations`

Internal ledger tracking how much of each payment belongs to the landlord org.

| Field | Type | Notes |
|---|---|---|
| `paymentId` | ObjectId | Unique ref to payments |
| `orgId` | ObjectId | Landlord's org |
| `grossAmount` | Number | Full payment amount |
| `platformFee` | Number | `grossAmount × PLATFORM_FEE_RATE` (default 5%) |
| `netAmount` | Number | `grossAmount - platformFee` (landlord's share) |
| `currency` | String | `usd` (from `STRIPE_CURRENCY` env) |
| `status` | Enum | `PENDING` → `SETTLED` |
| `settledAt` | Date | Set when funds are settled to landlord |

On refund: `netAmount` and `platformFee` reset to `0`, status → `SETTLED`.

---

### `creditaccounts` + `creditevents`

Ownership credit ledger (append-only).

- On payment PAID: `CreditEvent` with `type: CREDIT`, amount = `incentivesEarnedCredits`
- On refund: `CreditEvent` with `type: DEBIT`, same amount (reversal)
- Idempotency key: `stripe:<paymentIntentId>:credit:<paymentId>`

---

### `tokenledgerentries`

Token ledger (append-only).

- On payment PAID: `TokenLedgerEntry` with `type: PURCHASE`, source = `STRIPE_PAYMENT:<period>:<paymentIntentId>`
- Idempotent: skips if source already exists for that tenant+property

---

### `stripeWebhookEvents`

Deduplication log for Stripe webhook deliveries.

| Field | Notes |
|---|---|
| `eventId` | Stripe event ID (unique) |
| `eventType` | e.g. `payment_intent.succeeded` |
| `status` | `PROCESSING` → `PROCESSED` \| `FAILED` |
| `attempts` | Incremented on retry |
| `lastError` | Error message if `FAILED` |

---

### `users`

`stripeCustomerId` field added. Set on first payment intent creation per tenant. Used to link all future payments to the same Stripe Customer object.

---

## 4. Ownership Accrual Logic

Credits are calculated from the payment amount using `TOKENS_PER_CURRENCY_UNIT` env var (default: `1`):

```
tokenAmount = floor(paymentAmount × TOKENS_PER_CURRENCY_UNIT)
```

Example with defaults:
- Rent paid: $1,200
- Credits accrued: `floor(1200 × 1)` = **1,200 ownership credits**

Rules enforced before accrual (in `tokenLedger.service.ts`):
- Tenant must have an active tenancy
- Tenant must not have any `LATE` or `FAILED` payments on the property
- Tenant must not be evicted (`TERMINATED` / `ENDED` tenancy)
- Token balance cannot go negative
- Forfeit entries must reference a violation source

Accrual is idempotent — re-delivering the same Stripe webhook will not double-credit.

---

## 5. Failure & Retry Handling

### Payment failure

When Stripe fires `payment_intent.payment_failed`:
- Payment status → `FAILED`
- No credits accrued
- No landlord allocation created
- Tenant can retry by calling `POST /api/stripe/create-payment-intent` again (new PaymentIntent)

> Note: The unique index is on `{ tenantUserId, period, type }`. A new intent for the same period will get a `409 Conflict`. The tenant must either use a different period or the landlord must delete/update the failed record first.

### Webhook failure

If webhook processing throws, `StripeWebhookEvent` is saved with `status: FAILED` and `lastError` set. Stripe retries webhook delivery automatically (up to 3 days, exponential backoff). On retry:
- If `status: PROCESSED` → returns `{ duplicate: true }`, no re-processing
- If `status: FAILED` → re-processes (idempotency keys in ledger prevent double-writes)

### Idempotency keys

| Operation | Key |
|---|---|
| Credit event | `stripe:<paymentIntentId>:credit:<paymentId>` |
| Token ledger entry | `STRIPE_PAYMENT:<period>:<paymentIntentId>` (source field) |
| Landlord allocation | Unique index on `paymentId` |
| Refund credit reversal | `stripe:refund:<chargeId>:debit:<paymentId>` |

---

## 6. Refund Behavior

Triggered by Stripe webhook `charge.refunded`.

```
charge.refunded received
      │
      ├── Payment status → REFUNDED, refundedAt + refundAmount set
      ├── LandlordAllocation → netAmount=0, platformFee=0, status=SETTLED
      └── If incentivesEarnedCredits > 0:
            └── CreditEvent DEBIT created (reverses accrued credits)
```

**Partial refunds:** `refundAmount` is stored from `charge.amount_refunded`. Credit reversal currently reverses the full `incentivesEarnedCredits` regardless of partial refund amount. Partial credit reversal is a future enhancement.

**TokenLedgerEntry reversal:** Not yet implemented. Token ledger entries created on payment are not reversed on refund. To be added when token vesting rules are finalized.

---

## 7. Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `STRIPE_SECRET_KEY` | — | Required. Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | — | Required. Webhook signature verification |
| `STRIPE_CURRENCY` | `usd` | Payment currency |
| `TOKENS_PER_CURRENCY_UNIT` | `1` | Ownership credits accrued per $1 paid |
| `PLATFORM_FEE_RATE` | `0.05` | Platform fee deducted from landlord allocation (5%) |

---

## 8. Florin / Frontend Integration Notes

### API contract

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/stripe/create-payment-intent` | POST | Tenant JWT | Create PaymentIntent, get `clientSecret` |
| `/api/stripe/webhook` | POST | Stripe signature | Stripe webhook receiver |
| `/api/payments` | GET | Landlord JWT | List payments for landlord's properties |
| `/api/payments` | POST | Landlord JWT | Create payment manually |
| `/api/payments/:id` | PATCH | Landlord JWT | Update payment status |
| `/api/payments/:id` | DELETE | Landlord JWT | Delete payment |

### Frontend integration sequence

1. Tenant clicks "Pay Rent" → frontend calls `POST /api/stripe/create-payment-intent`
2. Backend returns `clientSecret` + `amount` (actual rent amount from lease)
3. Frontend renders Stripe Elements using `clientSecret`
4. Tenant completes card entry and submits
5. Stripe.js confirms payment → `payment_intent.succeeded` fires to backend webhook
6. Frontend polls or listens for payment status update (or shows optimistic success)

### Webhook registration (needs live URL from Florin)

Once backend is deployed:
1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://<deployed-url>/api/stripe/webhook`
3. Select events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`
4. Copy `Signing secret` → set as `STRIPE_WEBHOOK_SECRET` in deployed env
