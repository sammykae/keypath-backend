# KeyPath Backend — Manual Testing Guide (Sprint B/C)

> Manual test walkthrough for the 6 Sprint B/C backend tickets: Good Standing, Program Configuration,
> Vesting, Property Manager role, Liquidity, Import Pipeline, and PM Chat.
> Automated coverage: `npx jest` — 16 suites / 102 tests, all green.
> See `API_CONTRACT.md` for the full endpoint reference (used by Kunle for FE wiring).
> Last updated: 2026-07-09

---

## Setup

```bash
cd c:\projects\keypath-backend
npm run dev          # runs on port 3001
```

Open Swagger UI: **`http://localhost:3001/api-docs`**

**Login** via `POST /api/auth/login` as both a **landlord** and a **tenant** account, copy each `token`.
In Swagger, click **Authorize** (top-right) and paste `Bearer <token>` — this unlocks that role's endpoints.
Switch roles by re-authorizing with the other token.

---

## 1. Good Standing

**As landlord:**

| Step | Request | Expected |
|---|---|---|
| 1 | `POST /api/landlord/good-standing/{tenantUserId}/flags`<br>`{"type":"LEASE_VIOLATION","note":"unauthorized pet"}` | 201, status becomes `PAUSED` |
| 2 | `GET /api/landlord/good-standing/{tenantUserId}` | `status: PAUSED`, `eligibleForRewards: false` |

**As tenant:**

| Step | Request | Expected |
|---|---|---|
| 3 | `GET /api/tenants/good-standing` | Own status + `reasons[]` shown |
| 4 | `POST /api/tenants/rewards/{rewardId}/redeem`<br>`{"idempotencyKey":"test-redeem-001"}` | **403** — blocked while PAUSED |

> `rewardId` comes from `GET /api/tenants/rewards` (the reward catalog — pick any item's `rewardId`).
> `idempotencyKey` is any unique string you generate client-side; reusing it returns the same
> result without double-charging, reusing it with a different body returns 409.

**Resolve (landlord):**

| Step | Request | Expected |
|---|---|---|
| 5 | `PATCH /api/landlord/good-standing/{tenantUserId}/flags/{flagId}/resolve` | Status returns to `ACTIVE` |

**Admin override:** `PATCH /api/landlord/good-standing/{tenantUserId}/override` (ADMIN role only) — pass `status: null` to clear.

---

## 2. Program Configuration

**As landlord:**

| Step | Request | Expected |
|---|---|---|
| 1 | `GET /api/landlord/program-config/resolve?propertyId={propertyId}` | Platform defaults, `provenance.*: "PLATFORM"` |
| 2 | `PUT /api/landlord/program-config`<br>`{"scope":"PROPERTY","propertyId":"...","programType":"BOTH","tokenRules":{"enabled":true,"monthlyAccrualTokens":15,"vestingMonths":6}}` | 200, config saved |
| 3 | Repeat step 1 | `provenance.tokenRules.monthlyAccrualTokens: "PROPERTY"` |
| 4 | `POST /api/landlord/tenants/invite` without `participationModel` | Invite auto-fills the program type from the resolved config |

Hierarchy resolution order: **Organization → Property → Unit → Tenant** (each level overrides only the fields it explicitly sets).

---

## 3. Vesting

> Run **after** Program Configuration §2 — tokens must be enabled on the property/unit.

**As landlord:**

| Step | Request | Expected |
|---|---|---|
| 1 | `POST /api/landlord/tokens/accrual/run?dryRun=true`<br>`{"period":"2026-07"}` | Preview — `action: WOULD_ISSUE` per tenancy |
| 2 | Same with `dryRun=false` | Tokens actually issued |
| 3 | Repeat step 2, same period | `action: SKIPPED` — idempotent, already accrued |

**As tenant:**

| Step | Request | Expected |
|---|---|---|
| 4 | `GET /api/tenants/tokens/vesting` | New accrual appears under `unvestedTokens` (not vested immediately) |

**Tip:** to test with tokens vesting instantly, set `vestingMonths: 0` in the program config (§2 step 2).

---

## 4. Liquidity

> Run **after** Vesting §3 — tenant needs a positive vested balance.

**As tenant:**

| Step | Request | Expected |
|---|---|---|
| 1 | `POST /api/tenants/liquidity`<br>`{"tokens": 10}` | 201, `status: SUBMITTED` |
| 2 | `GET /api/tenants/liquidity` | Request appears in the list |

**As landlord:**

| Step | Request | Expected |
|---|---|---|
| 3 | `PATCH /api/landlord/liquidity/{requestId}/review`<br>`{"status":"APPROVED"}` | `rofrDecision: PENDING`, `rofrResponseDeadline` set (+30 days) |
| 4 | `POST /api/landlord/liquidity/{requestId}/deductions`<br>`{"amountTokens":2,"reason":"damage"}` | Optional — `vestedTokenPaymentRight` decreases |
| 5 | `PATCH /api/landlord/liquidity/{requestId}/rofr`<br>`{"decision":"WAIVED"}` | ROFR resolved |
| 6 | `PATCH /api/landlord/liquidity/{requestId}/transfer`<br>`{"status":"COMPLETED"}` | `status: COMPLETED`; ledger entries written |

**Verify:** re-check `GET /api/tenants/tokens/vesting` — `vestedTokens` should be reduced by the net payout.

**Negative tests:** try `/deductions` on a non-`APPROVED` request (400), try `/transfer` while `rofrDecision` is still `PENDING` (400), try cancelling (`DELETE /api/tenants/liquidity/{requestId}`) after it's `APPROVED` (400 — only `SUBMITTED`/`UNDER_REVIEW` are cancellable).

---

## 5. Property Manager Role

**As landlord:**

| Step | Request | Expected |
|---|---|---|
| 1 | `POST /api/landlord/property-managers`<br>`{"email":"pm@test.com","firstName":"Pat","propertyId":"..."}` | 201, PM user created if new, `status: PENDING`; an activation email is sent (or logged to the console if `EMAIL_password`/SendGrid isn't configured — check the server log for `[pm-invite] Activation link for ...`) |
| 2 | `GET /api/landlord/property-managers` | Assignment listed, `status: ACTIVE` |

**Activate the PM (passwordless — mirrors the tenant OTP invite flow, no auth required for these 3 calls):**

| Step | Request | Expected |
|---|---|---|
| 3 | Copy the `token` from the activation link (server console log if no email configured) | — |
| 4 | `GET /api/pm-invites/verify?token={token}` | `{ email, propertyName }` |
| 5 | `POST /api/pm-invites/send-otp`<br>`{"token":"..."}` | OTP emailed, or logged as `[pm-invite] OTP for ... : 123456` |
| 6 | `POST /api/pm-invites/verify-otp`<br>`{"token":"...","otp":"123456"}` | `{ authToken, user }` — PM is now `status: ACTIVE`. Use `authToken` as the PM's Bearer token from here on. |

**As the PM (using the `authToken` from step 6):**

| Step | Request | Expected |
|---|---|---|
| 7 | `GET /api/property-manager/my-properties` | Only the assigned property |
| 8 | `GET /api/property-manager/properties/{otherPropertyId}/notes` (not assigned) | **403** — Property A ≠ Property B access |

**Notes:**
- Assigning the same PM to a **second** property does **not** trigger another activation email — once `status: ACTIVE`, they just log in and see the new property via `GET /api/property-manager/my-properties`.
- There's no `POST /api/auth/login` for PMs — they only ever authenticate via this OTP flow (no password is ever set, same as tenants).
- `POST /api/pm-invites/send-otp` is rate-limited to one send per 60 seconds.

---

## 6. Import Pipeline (CSV)

Create a test file `test-tenants.csv`:

```csv
email,firstName,lastName,propertyRef,unitRef,monthlyRent,moveInDate
newtenant@test.com,Nadia,Test,Maple St,1A,1500,2026-08-01
```

`propertyRef` must exactly match an existing property's `name`; `unitRef` must match an existing unit's `unitNumber`.

**As landlord** (Swagger "Try it out" supports file upload):

| Step | Request | Expected |
|---|---|---|
| 1 | `POST /api/csv/upload` — multipart, `file` + `ingestionType=TENANT` | 201, returns `ingestionId` |
| 2 | `GET /api/csv/{ingestionId}/preview` | Headers + auto-detected column mapping |
| 3 | `POST /api/csv/{ingestionId}/process` | 202 — runs async, poll step 4 |
| 4 | `GET /api/csv/{ingestionId}` | Wait for `status: COMPLETE` |
| 5 | `POST /api/csv/{ingestionId}/persist` | Creates the tenant invite; response `tenantsCreated: 1`, `persistResults[]` |
| 6 | `GET /api/csv/sources` | `CSV_UPLOAD`/`EXCEL_UPLOAD`/`MANUAL_ENTRY` → `AVAILABLE`; PMS connectors → `COMING_SOON` |

**Negative tests:** a row with a `propertyRef` that doesn't exist → `ERROR` in `persistResults`; a row missing `propertyRef`/`unitRef` → `SKIPPED`; duplicate email within the same file → second occurrence `ERROR`.

---

## 7. Property Manager Chat

**As the PM:**

| Step | Request | Expected |
|---|---|---|
| 1 | `GET /api/property-manager/tenant-contacts` | Tenants on assigned properties only |
| 2 | `POST /api/chat/threads/with/{tenantUserId}`<br>`{"propertyId":"..."}` | Thread created |
| 3 | Same call **without** `propertyId` | Blocked (null/403) — propertyId + `MESSAGE_TENANT` permission required |

**As landlord:**

| Step | Request | Expected |
|---|---|---|
| 4 | `GET /api/landlord/chat/pm-threads` | The PM↔tenant thread appears (landlord is **not** a participant — read-only) |
| 5 | `GET /api/landlord/chat/pm-threads/{threadId}/messages` | Messages readable |

---

## Automated regression check

```bash
cd c:\projects\keypath-backend
npx tsc --noEmit    # must be clean
npx jest             # 17 suites / 114 tests, all green
```

Run this after any change to the modules above before considering a ticket done.

---

## Known follow-ups surfaced during testing

- ~~PM activation/login flow~~ — **done**: passwordless OTP invite flow (`/api/pm-invites/*`), see §5 above.
- **PM activation email/OTP screens (FE)** — Kunle needs to build the activation UI (`/pm-activate?token=...` → verify → request code → enter code), mirroring whatever screens exist for the tenant invite flow.
- **Vesting/Good Standing/ROFR numeric defaults** are configurable but still awaiting Laurel's final numbers (see TASKS.md → "Open product decisions").
