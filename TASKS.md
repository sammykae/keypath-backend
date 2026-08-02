# KeyPath — Dashboard Task List (Abdul + Kunle)

> Ordered work plan for the landlord & tenant dashboards, based on Laurel's three requirement documents and the Trello tickets.
> Laurel answered all 9 questions on 2026-07-06 (see "Laurel's decisions" below) — nothing is blocked anymore.
> **All 6 Abdul-owned Sprint B/C backend tickets are complete**, plus a 7th follow-up found during manual testing (Good Standing, Program-config hierarchy, Vesting, PM thin role, Liquidity, Import pipeline + PM chat, PM passwordless activation) — branch `feature/sprint-b-abdul`. Backend: `tsc --noEmit` clean, 17 test suites / 114 tests green. Remaining work is Kunle's FE (Sprint A + the 🅺 items noted per ticket) and the shared live-data/persistence pass.
> Last updated: 2026-07-08

**Legend:** ✅ done · ⬜ todo · 🅰 Abdul · 🅺 Kunle · 🅰🅺 shared

---

## ✅ Completed (2026-07-02 → 07-03, merged & deployed by Florin)

**Phase 1 quick wins:** roster + arrears CSV exports · maintenance issueType · rewardEligible/rewardDecision · status labels (Submitted/Under Review/In Progress/Completed/Rejected) · landlord direct-chat toggle (enforced server-side, tenant New Chat gated) · token-ledger event types (structure)

**Also done:** refresh-token auth (401 → auto-refresh → retry, logout on failure) · all 8 operational exports + Reports-page Export card · Property-Management Notes (BE module + FE tab with add/edit/delete-confirm) · roster sortable by Lease Left + Payment/days-late · churn→Renewal Risk in roster UI · RBAC tests (9) · full test suite green (9 suites / 42 tests) · tsc clean · API_CONTRACT.md · DEMO_MODE env fix

---

## Laurel's decisions (2026-07-06) — all questions answered

| # | Decision |
|---|----------|
| Q1 | PM role: build **thin role + property-assignment now**; full PM dashboard later |
| Q2 | Liquidity: **record-and-track only** (status, audit, vested token payment rights, deductions, transfer status, ROFR); payouts off-platform |
| Q3 | Vesting: **time-based, tokens accrue monthly** over tenancy; milestone/renewal later |
| Q4 | Good Standing: **build it** — auto from rent-current + no eviction + no material lease violation; landlord flags, admin overrides; downgrade pauses reward/token eligibility |
| Q5 | Program config: **hierarchy Organization → Property → Unit → Tenant with inheritance**; property-level defaults pre-fill invites; unit-level supported in schema from day one; MVP UI = property defaults + tenant overrides |
| Q6 | Maintenance labels: standardized ✅ (already done) |
| Q7 | Exports: roster + arrears first ✅ (all already done) |
| Q8 | Imports: manual + CSV for pilot, **but build a generic import pipeline** (validate → normalize → map → audit → persist); PMS connectors (AppFolio/Yardi/Buildium/RealPage/Entrata/MRI) plug in later; activation flow shows 4 methods (PMS "Coming Soon") |
| Q9 | RPA/TEPA separation: current separate ledgers satisfy it ✅ |

**Laurel's #1 near-term goal:** landlord + tenant dashboards fully on live data with persistence proven across refresh/logout/login. Then: Good Standing → Notes (done) → PM permissions → TEPA liquidity → phased PMS integrations.

**Laurel also asked for:** an implementation plan (tickets remaining, Abdul/Kunle/shared ownership, timing, demo-ready order, open product decisions, blockers).

---

## Next work queue (unblocked — Laurel's answers incorporated)

### Sprint A — dashboards fully live (Laurel's top priority)

- [ ] 🅺 **Wording sweep** — Doc 2 §1 replacements (ownership→Equity Credits, cash out→Liquidity Options, shares→Tokens…), headlines/subtext, Landlord Control card
- [ ] 🅺 **Clickable KPI cards** routing to property-level tabs; financial snapshot near top; tenant dashboard card rework; tab structures; time filters (30/90/YTD); loading/empty/error/permission states
- [ ] 🅰🅺 **Live-data + persistence audit** — walk every dashboard card/table against API_CONTRACT.md, replace any remaining mock data, prove refresh/logout/login persistence

### Sprint B — core backend features (Abdul)

- [x] ✅ 🅰 **Good Standing** — done 2026-07-08 (branch `feature/sprint-b-abdul`): `good-standing` module — auto-computed status (ACTIVE/AT_RISK/PAUSED/SUSPENDED) from arrears days (1/31/91 thresholds, configurable) + tenancy status + landlord flags (6 types with severity mapping); admin override wins; landlord flag/resolve endpoints; ADMIN-only override endpoint; tenant self-view `GET /api/tenants/good-standing`; PAUSED/SUSPENDED **blocks token accrual + reward redemption**; `goodStanding` field added to roster response; audit events on flag/resolve/override; 9 unit tests. 🅺 remaining: badge display on roster + tenant dashboard
- [x] ✅ 🅰 **Program-config hierarchy** — done 2026-07-08: `program-config` module — Org → Property → Unit → Tenant scopes with field-level inheritance (`mergeLayers`, 8 unit tests), provenance tracking (which scope supplied each field), legacy `property.participationModel` fallback. `GET /resolve` (effective config for any target), `GET/PUT/DELETE` CRUD, org-scoped, audit-logged. Tenant invites now **auto-pre-fill** `participationModel` from the unit's resolved config when the landlord doesn't pass one explicitly. 🅺 remaining: property Programs tab UI (property defaults + tenant overrides)
- [x] ✅ 🅰 **Vesting logic** — done 2026-07-08: `vesting.service.ts` — pure `computeVesting` (7 unit tests: accrual aging, purchases vest immediately, negative entries drain unvested-then-vested pool); `GET /api/tenants/tokens/vesting` (tenant summary: total/vested/unvested, token value, next vesting date, driven by resolved program config); `POST /api/landlord/tokens/accrual/run` (idempotent monthly accrual per tenancy, dry-run default, skips PAUSED/SUSPENDED Good Standing). 🅺 remaining: tenant Equity Credits card showing Total/Vested/Unvested
- [x] ✅ 🅰 **PM role (thin)** — done 2026-07-08: `PROPERTY_MANAGER` added to all three role enums (User model, AuthUser, authMiddleware/rbac normalizers); `property-manager` module — assignment model (propertyManagerUserId + propertyId + landlordId + permissions, unique-active-per-property so **Property A ≠ Property B** access), find-or-create PM user + org membership on assign, revoke, landlord CRUD (`/api/landlord/property-managers`), PM self-view (`GET /api/property-manager/my-properties`); **notes visibility wired**: PM can list/create `LANDLORD_AND_PM` notes on assigned properties only (`UPLOAD_NOTES` permission-gated), never sees `LANDLORD_ONLY` notes; 7 unit tests. Full dashboard later per Laurel.
- [x] ✅ 🅰 **PM passwordless activation** — done 2026-07-09 (follow-up gap found during manual testing): PM users were being created with no password and no way to ever log in. Added `property-manager` invite flow mirroring the tenant OTP invite (no password, ever) — `assignPropertyManager` auto-sends an activation email on first assignment (no-op on repeat assignments once ACTIVE); public routes `GET /api/pm-invites/verify`, `POST /api/pm-invites/send-otp`, `POST /api/pm-invites/verify-otp` → returns a JWT on success. 12 unit tests. 🅺 remaining: activation UI (`/pm-activate?token=` page + code entry), mirroring the tenant invite-acceptance screens.

### Sprint C — later features

- [x] ✅ 🅰 **Liquidity (record-and-track)** — done 2026-07-08: `liquidity` module — full lifecycle `SUBMITTED → UNDER_REVIEW → APPROVED → (deductions + ROFR decision) → transfer PENDING → COMPLETED` (or `DENIED`/`CANCELLED`); submit validated against live vested balance (via vesting service); landlord review/deduct/ROFR/transfer endpoints, tenant submit/list/cancel; **ROFR default response window 30 days** (configurable, open decision #3); completing the transfer writes `approved_deduction` + `transfer_request` ledger entries (reduces vested balance) — no on-platform payment per Laurel Q2; full audit trail (`statusHistory` + audit events); 17 unit tests (pure `computeVestedTokenPaymentRight` + state-machine guards + org isolation). 🅺 remaining: tenant Liquidity Options card + landlord requests view
- [x] ✅ 🅰 **Import pipeline framework** — done 2026-07-08: discovered a substantial existing pipeline (`csv-ingestion` module: upload → S3 store → auto-detect column mapping (alias dictionary) → schema-driven row validation → audit) that already covered validate/normalize/map/audit generically — did **not** duplicate it. Added the missing **persist** stage additively: `csv-persist.service.ts` resolves property+unit by name (propertyRef/unitRef, new optional TENANT-schema columns, plus `leaseEndDate`) and calls the same `inviteTenant` logic the manual "Invite Tenant" dialog uses — identical audit trail, duplicate-unit guard, invite email. New opt-in `POST /api/csv/:ingestionId/persist` (only after validation is COMPLETE; per-row CREATED/SKIPPED/ERROR results, never throws mid-batch). Added a `source` field (CSV_UPLOAD/EXCEL_UPLOAD/MANUAL_ENTRY + 6 PMS placeholders) and `GET /api/csv/sources` so the activation-flow UI can render "Coming Soon" PMS connectors without a backend redesign later (Q8). 7 unit tests. 🅺 remaining: activation flow UI (4 methods) + mapping/preview screens (endpoints already existed pre-this-session)
- [x] ✅ 🅰 **PM chat integration** — done 2026-07-08: `property_manager` added to chat's `ChatParticipantRole` + `Conversation.participants.role` enum + role-mapping helpers; **PM↔tenant chat start is permission-gated** — `findOrCreateDirectThread` requires `propertyId` + `hasPMAccess(pm, propertyId, 'MESSAGE_TENANT')`, mirroring the existing landlord-toggle guard; **landlord read-only visibility**: `GET /api/landlord/chat/pm-threads` + `.../messages` list/read PM↔tenant conversations in the org **without** adding the landlord as a participant (can view, cannot inject messages) — matches "landlord should be able to view the tenant/property manager chat for context"; PM's own contact list `GET /api/property-manager/tenant-contacts` (tenants on assigned properties only). 5 unit tests.

---

## Open product decisions still needed from Laurel

1. **Vesting numbers** — tokens per month (flat or % of rent?), any cliff, cap per tenancy?
2. **Good Standing thresholds** — how many days late = At Risk vs Paused? What counts as "material" lease violation (free-text flag ok for MVP?)
3. **Liquidity ROFR** — landlord response window (e.g. 30 days)? Request expiry?
4. **CSV import template** — approve column set for rent-roll/tenant CSV (we'll propose one)
