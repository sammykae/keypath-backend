# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
# Development (hot reload via nodemon + ts-node)
npm start
 
# Type-check and compile to dist/
npm run build

# Run all tests
npm test

# Run a single test file
npx jest src/modules/ledger/services/balanceService.test.ts

# Run tests matching a pattern
npx jest --testNamePattern="should compute balance"

# Seed scripts
npm run seed:ask-ai       # Seed Ask AI knowledge base
npm run seed:rewards      # Seed landlord rewards
npm run ingest-kb         # Ingest knowledge base documents
```

There are currently no test files in the codebase (`src/**/__tests__/**/*.test.ts` matches nothing). Jest is configured and ready — tests go in `__tests__/` subdirectories or as `*.test.ts` / `*.spec.ts` files anywhere under `src/`.

## Architecture Overview

KeyPath is a **real estate tokenization + property management platform**. The backend bridges traditional rental management (landlords, tenants, leases, credits) with an on-chain layer (ERC-20 property tokens on Polygon/Base).

### Request lifecycle

```
index.ts → connectDB() → createServer()
  → helmet / cors / compression / rateLimit (global 100 req/15min)
  → passport.initialize()
  → demoGuard middleware (blocks destructive writes in DEMO_MODE)
  → route handlers
  → keypathErrorMiddleware → errorMiddleware
```

### Auth architecture

Two parallel auth systems exist — know which to use:

- **Passport JWT** (`passport.authenticate('jwt', { session: false })`) — used by older routes. Attaches the full Mongoose `UserDocument` to `req.user`.
- **Custom `authMiddleware`** — used by newer routes. Verifies JWT manually and attaches a lightweight `AuthUser` (`{ _id, email, role, orgId }`) to `req.auth`.

`AuthenticatedRequest` (from `src/modules/auth/types/auth-request.ts`) extends Express `Request` with `auth?: AuthUser`. Use `req.auth` in modules that use the custom middleware.

RBAC is enforced with `requireRole(allowedRoles: UserRole[])` from `src/middleware/rbac.middleware.ts`. Roles: `tenant`, `landlord`, `community_stakeholder`, `investor`, `admin` (lowercase in `AuthUser`, uppercase `SCREAMING_SNAKE` in the Mongoose `User` model — normalization happens in both auth layers).

### Module structure

Every feature module under `src/modules/` follows this pattern:
```
module/
  controllers/   # thin — validate input, call service, return response
  services/      # business logic
  models/        # Mongoose schemas
  routes/        # Express Router + Swagger JSDoc annotations
  dto/           # Zod schemas for request validation
  validators/    # (older modules) Zod schemas
  types/         # TypeScript interfaces
```

### Key domain modules

| Module | What it does |
|---|---|
| `auth` | JWT + Passport local/Google/LinkedIn/Facebook. `generateJwt` in `core/config/passport.ts` |
| `onboarding` | Multi-role, multi-step wizard. Separate controllers/services/models per role: `tenant`, `landlord`, `community`, `investor`. State persisted in `onboarding_states` collection. Invite-link flow supported. |
| `ledger` | Append-only credit event ledger. Idempotent writes via `idempotencyKey`. Balance computed from events; optional snapshots for perf. See `src/modules/ledger/README.md` for usage. |
| `tokenization` | Off-chain config and state for property token issuance. Bridges to on-chain contracts. |
| `tokens` | Token holdings and transfer operations. |
| `marketplace` | Portfolio/token marketplace. |
| `waterfalls` | Distributes returns to token holders. |
| `tepa` | Tenant Equity Participation Agreement logic. |
| `properties` / `units` | Property and unit CRUD. |
| `tenancies` | Lease/tenancy management. |
| `finances` | Financial records. |
| `landlord-rewards` | Seeded reward catalog for landlords. |
| `ask-ai` | RAG-powered Q&A against the `knowledge/` corpus using Gemini. Auth-gated, feature-flagged (`ASK_AI_ENABLED`). |
| `ai` | General Gemini chat (`/api/ai/chat` and `/api/ai/search` — currently unauthenticated). |
| `chat` | Role-scoped chat (landlord and tenant variants). |
| `orgs` | Organization management. |
| `demo` | Demo data seeding (ADMIN only, `DEMO_MODE=true` required) + public `/api/request-demo` form. |
| `public` | Unauthenticated public endpoints. |
| `docs` | Document management. |
| `program` | Program configuration. |

### On-chain layer

`onchain/` is a separate Hardhat + Foundry project with two Solidity contracts:
- `KeyPathToken.sol` — ERC-20 per property, MINTER_ROLE gated.
- `KeyPathMultiToken.sol` — ERC-1155 multi-asset variant.

The backend connects via `POLYGON_RPC` / `BASE_RPC` env vars. Chain interaction lives in `src/modules/tokenization/services/mirrorService.ts`.

### Response envelope

All responses use the shared helpers from `src/core/utils/response.ts`:

```typescript
successResponse(res, data, status?)   // { success: true, requestId, data, error: null }
errorResponse(res, status, code, message, details?)  // { success: false, requestId, data: null, error: { code, message } }
```

Always use these — never call `res.json()` directly.

### Validation

Request bodies are validated with Zod via `validateRequest(schema)` middleware (`src/middleware/validate.middleware.ts`). Define schemas in the module's `dto/` or `validators/` directory.

### Demo mode

`DEMO_MODE=true` in env activates `demoGuard`, which blocks all `POST/PUT/PATCH/DELETE` except for paths in `DEMO_ALLOWED_PATHS` and requests from ADMIN users. The `env.ts` DEMO_MODE transform has a known bug: `v === 'false'` should be `v === 'true'` — meaning demo mode currently never activates from env.

### Environment variables

Validated at startup via Zod in `src/core/config/env.ts`. Required: `MONGO_URI`. Notable defaults:
- `JWT_SECRET` defaults to `'defaultsecret'` — must be overridden in production.
- `DEMO_MODE` defaults to `'false'`.
- `BACKEND_URL` defaults to `http://localhost:3000` (used for OAuth callback URLs).

### Knowledge base

`knowledge/` contains markdown documents covering the KeyPath business domain (TEPA, token mechanics, landlord/tenant workflows, legal framework, etc.). These are ingested into MongoDB Atlas Vector Search for the `ask-ai` module via `npm run ingest-kb`.

---

## Business Logic & Non-Negotiable Rules (Backend Canon v1.1)

These rules come from the authoritative product spec. Do not violate them.

### System invariants

1. **Append-only ledger** — Ownership Credits are never edited directly. Every change is a new ledger entry. Balances are always derived from entries, never stored as a mutable field.
2. **RBAC on every endpoint** — No endpoint is exempt. Use `authMiddleware` + `requireRole()`.
3. **Ask AI is read-only** — It must never execute ledger actions, promise legal advice, or expose another user's data.
4. **Every major action writes an audit event** — Use the `events` collection (`actorUserId`, `role`, `eventType`, `entityType`, `entityId`, `metadata`).
5. **Community dashboards contain no tenant PII** — Always return aggregated, anonymized data to `community_stakeholder` and `investor` roles.
6. **Single source of truth is MongoDB** — The Mongo collections below are authoritative.

### Naming convention

Use **`ownershipCredits`** (camelCase) in all schema field names and collection names. **Never use "equity"** in schema names — it has legal implications the product deliberately avoids.

### Per-ticket checklist

Every new endpoint must have:
- RBAC enforcement (`requireRole`)
- Zod request validation (`validateRequest`)
- Response uses `successResponse` / `errorResponse` envelope
- Audit event written to the `events` collection

### MVP scope

**In scope:** Auth + RBAC, onboarding (all 4 roles), role dashboards, Ownership Credits ledger, valuation snapshots, maintenance + rewards (basic), chat (request/accept/threads/messages), Ask AI (RAG + Gemini), document uploads (S3) with OCR hook placeholder.

**Not in scope yet:** On-chain token issuance, public token marketplace / external trading, Stripe payments (scaffold only, `FEATURE_STRIPE_PAYMENTS=false`), complex financial custody, full legal process automation.

### Feature flags

| Flag | Default | Notes |
|---|---|---|
| `FEATURE_INVESTOR_TRANSACTIONS` | `false` | Scaffold endpoints but disable |
| `FEATURE_STRIPE_PAYMENTS` | `false` | Until payment flow is ready |
| `FEATURE_OCR_PIPELINE` | `true` | Accept uploads now; async parsing later |
| `FEATURE_CHAT` | `true` | |
| `FEATURE_ASK_AI` | `true` | Also controlled by `ASK_AI_ENABLED` env var |

### RBAC data access rules

| Role | Can read | Can write |
|---|---|---|
| `tenant` | Own unit, own credit balance, own valuation history, own docs, own maintenance, own chats | Maintenance tickets, onboarding, chat request/accept, Ask AI |
| `landlord` | Properties/units they own, tenant summaries (limited — no PII), aggregate KPIs, program configs, chats | Property/unit onboarding, invite tenants, program config, maintenance responses, chat request/accept |
| `community_stakeholder` | Aggregated metrics only, public portfolio insights, chats (opt-in) | Onboarding, chat request/accept, Ask AI (community-scoped) |
| `investor` | Portfolio summaries + performance aggregates (read-only MVP), chats (opt-in) | Onboarding, chat request/accept, Ask AI (investor-scoped) |
| `admin` | Full access | Full access + user suspend/reactivate, Ask AI knowledge library management |

### Canonical MongoDB collection names

These are the authoritative collection names from the product spec. New schemas must align with these:

| Collection | Purpose |
|---|---|
| `users` | Auth + profile (see `user.model.ts`) |
| `organizations` | Landlord/community/investor orgs |
| `memberships` | User ↔ org relationships with `roleInOrg: OWNER\|ADMIN\|MEMBER` |
| `properties` | Properties scoped to landlord orgs |
| `units` | Units under properties; `status: VACANT\|OCCUPIED` |
| `ownershipCreditProgramConfigs` | Per-unit program rules (accrual, buyback, rent caps) — unique index on `unitId` |
| `ownershipCreditLedgerEntries` | **Append-only.** Entry types: `EARN\|BUY\|ADJUST\|FORFEIT\|CASHOUT\|FREEZE\|UNFREEZE`. Has `referenceType: RENT\|CONTRIBUTION\|INCENTIVE\|ADMIN\|MAINTENANCE\|EXIT` |
| `valuationSnapshots` | Per-unit valuation history. `method: APPRAISAL\|BPO\|AVM`, `source: MANUAL\|ZILLOW\|REDFIN\|CORELOGIC\|OTHER` |
| `maintenanceTickets` | `severity: LOW\|MEDIUM\|HIGH`, `status: OPEN\|IN_PROGRESS\|RESOLVED\|CLOSED` |
| `rewardEvents` | `type: ON_TIME_RENT\|MAINTENANCE_PREVENTION\|RENEWAL\|BONUS`, `status: PENDING\|ISSUED\|CANCELED` |
| `documentTemplates` | TEPA summaries, disclosures, FAQs — `audienceRole` filtered |
| `signedDocuments` | Signing audit trail with `signatureEvidence: { ip, userAgent, method }` |
| `chatRequests` | `status: PENDING\|ACCEPTED\|DECLINED\|BLOCKED`; thread only created on ACCEPTED |
| `chatThreads` | `participantUserIds[]`, context `{ unitId?, propertyId?, orgId? }` |
| `chatMessages` | `messageType: TEXT\|FILE\|SYSTEM`, `readByUserIds[]` |
| `events` | Audit stream. All major actions write here. |
| `askAiKnowledgeDocs` | RAG docs with `embedding` (vector), `audienceRole`, `sourceType: FAQ\|TEPA_SUMMARY\|PRODUCT_DOC\|POLICY`. Atlas Vector Search index on `embedding`. |

> Note: The current `ledger` module uses different event type names (`CREDIT`, `DEBIT`, etc.) from the canon spec (`EARN`, `BUY`, etc.). The `ownershipCreditLedgerEntries` canonical types above are the intended final model.

### Infrastructure

- **File uploads** → AWS S3 (`@aws-sdk/client-s3`). Metadata stored in MongoDB. OCR parsing is an async hook placeholder for now.
- **AI** → Google Gemini (`@google/genai`). Ask AI uses RAG over `askAiKnowledgeDocs` with Atlas Vector Search.
- **Frontend** → Vercel (separate repo). This backend is consumed by Kunle (frontend lead).
