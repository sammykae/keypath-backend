# Stripe Payment Testing Guide

Complete guide for testing the Stripe payment integration end-to-end.

- Base URL: `http://localhost:3000` (or deployed backend URL)
- Auth: `Bearer <JWT>` (tenant JWT required for payment endpoints)
- Content-Type: `application/json`

---

## Payment Flow Overview

```
Tenant → POST /api/stripe/create-payment-intent
       → Stripe Customer find/create (linked to tenant user)
       → Stripe PaymentIntent created
       → clientSecret returned to frontend
       → Frontend confirms payment via Stripe.js
       → Stripe fires webhook: payment_intent.succeeded
       → Payment marked PAID in MongoDB
       → Ownership credits accrued to tenant ledger
       → LandlordAllocation record created (gross - 5% fee = net)
```

---

## Prerequisites

### 1. Environment variables

Add these to your `.env`:

```env
STRIPE_SECRET_KEY=sk_test_...       # from KeyPath Stripe sandbox dashboard
STRIPE_WEBHOOK_SECRET=whsec_...     # from Stripe CLI (local) or dashboard (live)
STRIPE_CURRENCY=usd
TOKENS_PER_CURRENCY_UNIT=1          # 1 ownership credit per $1 paid
PLATFORM_FEE_RATE=0.05              # 5% platform fee (default)
```

### 2. Required data before testing

- A **tenant user** with a valid JWT (`role: TENANT`)
- An **active tenancy** (`status: ACTIVE`) linked to that tenant with `rentAmount` set
- The tenancy must be linked to a `unit` → `property` → `org`

---

## Local Testing with Stripe CLI

When the backend is not deployed, use Stripe CLI to forward webhooks to localhost.

### Step 1 — Install Stripe CLI

```bash
# Windows (via scoop)
scoop install stripe

# or download from https://stripe.com/docs/stripe-cli
```

### Step 2 — Login to KeyPath Stripe sandbox

```bash
stripe login
# Opens browser — login with KeyPath sandbox credentials
```

### Step 3 — Forward webhooks to local server

```bash
stripe listen --forward-to http://localhost:3000/api/stripe/webhook
```

Copy the `whsec_...` value printed and set it as `STRIPE_WEBHOOK_SECRET` in `.env`, then restart the server.

---

## API Endpoints

### 1. Create Payment Intent

`POST /api/stripe/create-payment-intent`

**Auth:** `Bearer <tenant JWT>`

**RENT payment (amount comes from tenancy.rentAmount):**

```json
{
  "type": "RENT",
  "period": "2026-05"
}
```

**RENT with explicit tenancyId (required if tenant has multiple active leases):**

```json
{
  "type": "RENT",
  "period": "2026-05",
  "tenancyId": "507f191e810c19729de860ea"
}
```

**TOKEN_PURCHASE (custom amount):**

```json
{
  "type": "TOKEN_PURCHASE",
  "amount": 50,
  "period": "2026-05"
}
```

**Success response (201):**

```json
{
  "paymentId": "664a1f...",
  "clientSecret": "pi_xxx_secret_xxx",
  "stripePaymentIntentId": "pi_xxxxxxxxxxxxxx",
  "tenancyId": "507f191e810c19729de860ea",
  "unitId": "507f191e810c19729de860eb",
  "propertyId": "507f191e810c19729de860ec",
  "orgId": "507f191e810c19729de860ed",
  "period": "2026-05",
  "amount": 1200
}
```

**Error cases:**

| Status | Reason |
|---|---|
| 400 | `amount` sent for RENT (not allowed) |
| 400 | `amount` missing for TOKEN_PURCHASE |
| 400 | Multiple active tenancies — send `tenancyId` |
| 404 | No active tenancy found for tenant |
| 409 | Payment for this type + period already exists |
| 500 | `STRIPE_SECRET_KEY` not set |

---

### 2. Stripe Webhook

`POST /api/stripe/webhook`

**Auth:** None (Stripe signature header only)

This is called automatically by Stripe. Do not call manually in production.

**To simulate via Stripe CLI:**

```bash
# Simulate a successful payment
stripe trigger payment_intent.succeeded

# Simulate a failed payment
stripe trigger payment_intent.payment_failed
```

**What happens on `payment_intent.succeeded`:**
1. Payment status → `PAID`
2. Ownership credits accrued to tenant's credit ledger
3. Token ledger `PURCHASE` entry created (idempotent)
4. `LandlordAllocation` record created with `status: PENDING`

---

### 3. Confirm Payment (frontend — Stripe.js)

The frontend uses `clientSecret` from step 1 to confirm the payment via Stripe.js:

```javascript
const stripe = Stripe('pk_test_...');

const { error } = await stripe.confirmCardPayment(clientSecret, {
  payment_method: {
    card: cardElement,
  }
});
```

For testing without a frontend, use the Stripe CLI:

```bash
# Get the PaymentIntent ID from the create-payment-intent response
stripe payment_intents confirm pi_xxxxxxxxxxxxxx \
  --payment-method pm_card_visa
```

---

## Verifying Results in MongoDB

After a successful payment, check these collections:

### payments collection

```js
db.payments.findOne({ stripePaymentIntentId: "pi_xxx" })
// status should be "PAID"
// paidAt should be set
// incentivesEarnedCredits should be > 0
```

### landlordAllocations collection

```js
db.landlordAllocations.findOne({ paymentId: ObjectId("...") })
// grossAmount = rent paid
// platformFee = grossAmount * 0.05
// netAmount = grossAmount - platformFee
// status = "PENDING"
```

### creditaccounts / creditevents (ownership ledger)

```js
db.creditaccounts.findOne({ tenantUserId: ObjectId("...") })
db.creditevents.find({ accountId: ObjectId("...") }).sort({ createdAt: -1 })
// type: "CREDIT", amount: earned credits
```

### tokenledgerentries

```js
db.tokenledgerentries.find({ tenantId: ObjectId("...") }).sort({ timestamp: -1 })
// type: "PURCHASE", source: "STRIPE_PAYMENT:2026-05:pi_xxx"
```

---

## Test Cards (Stripe sandbox)

| Card Number | Result |
|---|---|
| `4242 4242 4242 4242` | Payment succeeds |
| `4000 0000 0000 9995` | Payment fails (insufficient funds) |
| `4000 0025 0000 3155` | Requires 3D Secure authentication |

Expiry: any future date. CVC: any 3 digits.

---

## Landlord Payment Management (Landlord role)

### List payments for landlord's properties

`GET /api/payments?range=12m`

**Auth:** `Bearer <landlord JWT>`

Query params:
- `range` — e.g. `3m`, `6m`, `12m` (default `12m`)
- `propertyId` — filter by property
- `unitId` — filter by unit
- `tenantUserId` — filter by tenant
- `status` — `DUE | PAID | LATE | FAILED`

### Create payment manually

`POST /api/payments`

```json
{
  "tenantUserId": "...",
  "unitId": "...",
  "propertyId": "...",
  "period": "2026-05",
  "amount": 1200,
  "status": "PAID",
  "method": "cash"
}
```

### Update payment status

`PATCH /api/payments/:paymentId`

```json
{
  "status": "PAID",
  "paidAt": "2026-05-07T10:00:00Z"
}
```

**Valid status transitions:**

```
DUE   → PAID, LATE, FAILED
LATE  → PAID, FAILED, DUE
FAILED → DUE, PAID
PAID  → (terminal — no transitions)
```

---

## Common Issues

| Problem | Fix |
|---|---|
| `Stripe is not configured` | Set `STRIPE_SECRET_KEY` in `.env` |
| `Stripe webhook not configured` | Set `STRIPE_WEBHOOK_SECRET` — run `stripe listen` first |
| `No active tenancy found` | Create a tenancy with `status: ACTIVE` and `rentAmount > 0` |
| `Payment already exists for period` | Use a different `period` or delete the existing payment |
| `Invalid Stripe signature` | Restart server after updating `STRIPE_WEBHOOK_SECRET` |
| Webhook fires but ledger not updated | Check MongoDB for `stripeWebhookEvents` with `status: FAILED` — check `lastError` |
