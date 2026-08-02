# KeyPath — API / Data Contract (for Kunle)

> Frontend component → endpoint → status mapping, per Laurel's workflow ("Step 2: Abdul creates the API/data contract").
> All responses use the envelope: `{ success, requestId, data, error }` — read `res.data.data`.
> Auth: `Authorization: Bearer <kp_token>`. On 401 the FE axios interceptor auto-refreshes via `POST /api/auth/refresh`.
> Swagger: `http://localhost:3001/api-docs`
> Last updated: 2026-07-09 — Laurel answered all 9 questions on 2026-07-06; nothing is blocked anymore. PM passwordless activation flow added.

**Status legend:** ✅ Ready (FE already wired) · 🟢 Ready (endpoint live, FE wiring optional/partial) · 🔒 Blocked on Laurel's answers

## Auth

| Component | Endpoint | Status |
|---|---|---|
| Login | `POST /api/auth/login` → `{ token, refreshToken, user }` | ✅ |
| Token refresh (automatic) | `POST /api/auth/refresh` `{ refreshToken }` → new pair | ✅ |
| Profile | `GET /api/auth/me/profile` | ✅ |

## RBAC / Access Control Audit (NEW — P1 Add Role-Based Access Control and Test With Multiple Users)

A targeted security audit for cross-tenant/cross-landlord data leaks (IDOR — insecure direct object reference), focused on file-serving endpoints and any route taking a raw ID param without an ownership check. Not an exhaustive line-by-line re-audit of every endpoint — most of this session's own work already scopes by `tenantUserId`/org membership/PM assignment by construction. Four real, confirmed vulnerabilities found and fixed:

| # | Endpoint | Was | Fixed to |
|---|---|---|---|
| 1 | `GET /api/docs/files/*` | **No auth middleware at all** — fully public on the internet. Serves any uploaded document (signed leases, RPA/TEPA agreements, compliance docs, maintenance photos) to anyone who obtains a fileKey by any means (logs, browser history, a shared link, a bug elsewhere) | `authMiddleware` required |
| 2 | `GET /api/docs/presigned-url` | Required `landlord`/`admin` role, but **any landlord could fetch any other org's document** — no check that the key's embedded orgId matched the caller's own org | Verifies the key's `docs/<orgId>/...` segment matches the caller's org (admin exempt) |
| 3 | `GET /api/tenants/maintenance/file` + `GET /api/landlord/maintenance/file` (shared handler) | **Any authenticated tenant/landlord could view any other tenant's/org's maintenance attachment** by passing its fileKey — no check the ticket belonged to them | Looks up the ticket owning the fileKey; tenant must be `ticket.tenantUserId`, landlord must own `ticket.orgId` |
| 4 | `GET /api/ledger/:tenant_id` and `GET /api/ledger/property/:id` | **No ownership check at all** — any authenticated user of any role could read any tenant's full TEPA token ledger, or any property's, by changing the URL param. This is the exact "Tenant A cannot see Tenant B's data" / "Landlord A cannot see Landlord B's portfolio" violation the ticket names as acceptance criteria | Tenant may only request their own `tenant_id`; landlord only tenants/properties with a tenancy/property in their org (via `Membership` OWNER/ADMIN); tenants are never allowed on the property-ledger route (it would leak every tenant on that property, not just their own); admin unrestricted |

**Already correct, verified during this audit (not a gap):** chat message reads (`getMessages`) already call `canAccessConversation(userId, conversationId)` before returning anything — a non-participant gets nothing. Every PM-facing endpoint built or touched this session enforces `hasPMAccess`/assignment + permission before returning data — never trusts org `Membership` alone (an explicit, longstanding rule in this codebase). Every landlord-facing endpoint built this session resolves `orgId` via `resolveLandlordOrgId` and filters every query by it.

**Residual, lower-severity gap flagged (not fixed):** even after fix #1, `GET /api/docs/files/*` only checks that the requester is *authenticated* — it does not verify they own the specific resource behind an arbitrary fileKey, because that route is shared across many modules with different ownership models (org-scoped, tenant-scoped, PM-scoped) and there's no single generic authorization rule that fits all of them. The real, effective mitigation already in place is that this proxy path is a fallback only used when `AWS_S3_BUCKET` isn't configured; production `resolveFileUrl()` helpers throughout the codebase generate short-lived (1 hour) presigned S3 URLs directly, which never touch this route. Fully closing this would mean either migrating every consumer off the raw proxy or building a per-module authorization matrix — bigger scope than this pass, and lower risk than the 4 fixes above since it requires both S3 being unconfigured *and* a leaked key.

## Audit Logs for Sensitive Actions (NEW — P1 Add Audit Logs for Sensitive Actions)

`AuditEvent` (`src/modules/audit/models/audit-log.model.ts`, collection `audit_events`) was already the de-facto audit trail used across most of the codebase, but had two structural gaps against the ticket's exact requirements and several call sites with incomplete before/after values. Fixed centrally rather than patching every call site individually:

| Gap | Fix |
|---|---|
| No `userRole` field anywhere on the model | Added `userRole?: string`. A `pre('save')` hook (`applyAuditEventPreSave`, exported for unit testing) auto-resolves it from `actorUserId` via a `User.findById().select('role').lean()` lookup whenever it isn't passed explicitly — retroactively covers every existing and future call site with zero call-site changes. Lookup failure never blocks the write. |
| Ticket requires flat `oldValue`/`newValue`; codebase convention is `diff.before`/`diff.after` | Added `oldValue`/`newValue` fields, synced bidirectionally with `diff` in the same pre-save hook — either shape is queryable, callers can keep using whichever they already use. |
| `createTokenLedgerEntry()` (the single write path for every token ledger entry — accrual, purchase, adjustment, forfeit, correction, etc. via the manual `POST /api/ledger/entry` endpoint and the Stripe payment bridge) had **zero** audit coverage | Added a `writeAuditEvent()` call inside it, mapping entry type → `TOKEN_ISSUED` / `TOKEN_VESTED` / `TOKEN_CORRECTED` / `TOKEN_FORFEITED` / `TOKEN_LEDGER_ENTRY_CREATED`, with `diff.before/after` balance and the acting user's role captured via a new optional `actor` param (`{ userId, role }`, sourced from `req.auth` in the controller; omitted → `source: 'system'` for the Stripe path). |
| Landlord/PM maintenance-ticket updates only fired a generic `MAINTENANCE_UPDATED` action regardless of the new status | Added a distinct `MAINTENANCE_CLOSED` `AuditEvent` (with `diff.before/after` status) fired alongside the existing generic event whenever a ticket transitions to `CLOSED`, in both `landlordMaintenance.service.ts` and `propertyManagerOperations.service.ts`. |
| Compliance document upload/review fired one generic action (`COMPLIANCE_DOCUMENT_UPLOADED` / `COMPLIANCE_STATUS_CHANGED`) regardless of type/outcome | `uploadComplianceDocument` now fires `DEBT_DOCUMENT_UPLOADED` specifically for `MORTGAGE_DEBT_DOCUMENT`; `updateComplianceStatus` now fires `COMPLIANCE_DOCUMENT_APPROVED` / `COMPLIANCE_DOCUMENT_REJECTED` (with `diff.before/after` status, plus the rejection reason in `metadata`). |
| `rewardVerification.service.ts` review/dispute/resolve events recorded only `after` values, never `before` | `reviewVerification` (both DENY and APPROVE/ISSUE branches), `disputeVerification`, and `resolveDispute` now all include `diff.before.status` alongside `after`. |
| `agreement.service.ts`'s `uploadSignedAgreement` recorded `metadata` but no status transition | Now includes `diff: { before: { status }, after: { status } }` (before is `null` for a brand-new agreement). |

**Already correct, verified during this audit (not a gap):** `program-config` (`PROGRAM_CONFIG_CHANGED`/`PROGRAM_CONFIG_DELETED`) and `good-standing` (flag/resolve/override events) already captured full before/after diffs. `propertyManager.service.ts`'s `updateAssignmentPermissions()` already fires `PROPERTY_MANAGER_PERMISSIONS_CHANGED` with a complete diff — covers the "Permission change audit events" checklist item with no changes needed.

Required fields per the ticket (`auditLogId`→`_id`, `userId`→`actorUserId`, `userRole`, `action`, `entityType`, `entityId`, `oldValue`, `newValue`, `timestamp`→`createdAt`) are now all present on every `AuditEvent` row, whether the call site was updated this pass or not.

## Reports Page KPIs (NEW — P2 Update Reports Page With Real Estate KPIs and Backend-Connected Charts)

**Audit finding:** most of the 7 required report areas already had real, org-scoped JSON aggregation logic somewhere in the codebase (`landlordReports.service.ts`, `landlordDashboard.service.ts`, `landlordFinances.service.ts`, `landlordDebt.service.ts`, `campaign.service.ts`) — it just wasn't consolidated, wasn't time-filterable in the way the ticket wants (Last 30 Days / Last 90 Days / This Year — no existing convention supported this; the one prior pattern was `?range=6m`/`?range=12m` on `/api/landlord/dashboard` only), and in one case used the wrong terminology. `src/modules/reports/` itself is exclusively PDF/CSV export (portfolio PDF, council-brief PDF, 5-report city-program CSV/PDF engine) — zero JSON chart endpoints exist there, so this was built under `src/modules/landlord/` alongside the other landlord-scoped JSON aggregations instead.

**Kept the existing `GET /api/landlord/reports` untouched** — Kunle's Reports page (`c:\projects\keypath\src\features\landlord\reports\`) already consumes it in production, including the `ownershipMix` field name. Renaming it in place would have broken a shipped screen. Instead, a new, additive endpoint was built for the reworked Reports page to migrate onto:

`GET /api/landlord/reports/kpis?range=30d|90d|1y` (aliases: `last30days`/`last90days`/`thisyear`, case/spacing-insensitive; defaults to `thisyear`). Returns:

| Field | Report area | Source |
|---|---|---|
| `occupancy.current` (`occupied`, `total`, `occupancyRate`, `byUnitStatus: {VACANT,OCCUPIED,TURN,OFFLINE}`) + `occupancy.trend` (monthly, across the selected range) | Occupancy | New — `byUnitStatus` is the first place in the codebase that surfaces the 4-value `Unit.status` enum distinctly (existing occupancy logic elsewhere derives only a binary occupied/not from active tenancies) |
| `noiExpenses.trend` (`{period, income, expenses, noi}` per month in range), `.expenseBreakdown`, `.totals` | NOI / Expenses | Reshaped from `landlordFinances.service.ts`'s single-month `expenseBreakdown` into a range-bucketed trend over `UnitFinancialsModel` |
| `leaseExposure.expiringInWindowCount`, `.expiryTrend` (12-month calendar view), `.expiringList` (up to 50 tenancy rows — property/unit/tenant ids + leaseEnd) | Lease Exposure | `windowDays` reuses the *same* range filter as a **forward-looking horizon** (Last 30/90 Days → next 30/90 days; This Year → through days-elapsed-this-year) since lease exposure is inherently a forward risk metric, not a trailing one — documented here since it's the one area where "time filter" doesn't mean "trailing window" |
| `tenantParticipation.{rpaCount,tepaCount,bothCount,tepaEnabledCount}` (unchanged from `landlordReports`), `.enrollmentRate` (new — real % of tenancies with an `ACTIVE` `TenantParticipationModel` row, vs. the old proxy-only participation-model counts), `.equityCreditsMix` | Tenant Participation | **Terminology fix**: `landlordReports.service.ts`'s `ownershipMix` field (token-pool LANDLORD/TENANT/INVESTOR split) is exactly the kind of tenant/TEPA-facing data this ticket says must never be called "ownership" — reused here renamed to `equityCreditsMix`, per the ticket's explicit rule. The old field name is left alone on the legacy endpoint for compat |
| `rewardsBudget.{totalBudgetUsd,totalSpentUsd,remainingUsd}`, `.byCampaign[]` | Rewards Budget vs Spent | New org-wide rollup — reuses `campaign.service.ts`'s per-campaign budget-vs-spent calc (`budgetUsd`/`budgetTokenCap` vs. ledger-issued tokens via `getCampaignMetricsMap`) but sums across every campaign in the org; no such aggregate existed before (only a per-campaign list) |
| `debtMaturityLadder.ladder` (quarter-bucketed), `.summary` | Debt Maturity Ladder | Reused as-is from the (previously duplicated-in-two-places) `PropertyFinancingModel` maturity-date aggregation. Not range-filtered — a maturity ladder is a forward schedule of all future debt, not a trailing metric |
| `portfolioSummary` | Portfolio Summary | Same shape as `landlordReports.portfolio`, computed once alongside the other sections |
| `investorOwnerMix` | Investor/Owner Mix | Always `null`. No named-investor/owner entity exists in this product (no `InvestorModel`/`OwnerModel`) — the only "investor" data is a pooled, anonymous token-ledger split, already surfaced under `tenantParticipation.equityCreditsMix`. Per the ticket's own "if applicable" qualifier, this area is not applicable here; returned explicitly as `null` rather than fabricated |

**Drilldown for "clicking report segments"** (acceptance criterion: clicking a segment routes to relevant data): `GET /api/landlord/reports/units?status=VACANT|OCCUPIED|TURN|OFFLINE` — an **org-wide** unit list filtered by status (distinct from the existing per-property `GET /api/landlord/properties/:propertyId/units`), for the Occupancy chart's click-through. Every other report area's segment click can route to an **existing** endpoint: a campaign row → `GET /api/landlord/campaigns` (already returns full per-campaign detail); a property row → `GET /api/landlord/properties/:propertyId`; an expiring lease → already included as row-level data directly in `leaseExposure.expiringList`, no extra round-trip needed. Wiring the actual click→navigate behavior is Kunle's responsibility per the ticket.

Both new routes inherit `authMiddleware` + `requireRole(['landlord','admin'])` and org-scoping (`resolveLandlordOrgId` → `PropertyModel.find({orgId})` → derive scoped ids) from the router-level guards already in place on `landlordDashboard.routes.ts`, consistent with every other landlord endpoint.

## AI Suggestions (NEW — P2 Add AI Suggestions Based on Real Landlord Portfolio Data)

**Not greenfield — this ticket's exact problem already existed in the codebase and was fixed in place.** `GET /api/landlord/ai-suggestions` (`landlordAiSuggestions.service.ts`) already existed with real trigger conditions (occupancy %, lease-expiry windows) but **fabricated magnitude claims baked into the copy** — `"...may reduce churn by up to 15%"`, `"...extend lease duration by 6–8 months"`, `"...reduce turnover by up to 30%"`, `"...renew at 2x the rate"`, `"...improve retention by 10–12%"` — none of these percentages were computed from anything; they were invented template strings. This is precisely what the ticket's acceptance criteria ("no random or unsupported suggestions", "suggestions are tied to actual data") prohibit, so the service was rewritten rather than extended.

**Kept the response contract additive, not breaking** — the frontend (`c:\projects\keypath\src\features\landlord\_shared\components\AIRetentionSuggestionCard.tsx`) already renders this endpoint's `suggestions[].text` in a live "AI Retention Suggestion" card; it doesn't read `type` at all. So `text` stays a plain string (now numerically honest), and two new fields were added without touching what's already wired up:
- `reason: string` — the "why am I seeing this?" explanation the ticket's acceptance criteria requires
- `sourceData: Record<string, unknown>` — machine-readable evidence (unit/tenancy ids, counts, $ amounts) backing the claim, for a future richer card UI

`type` values changed from the old ad-hoc set (`churn|occupancy|renewal|rewards|general`) to the ticket's 8 focus-area categories plus a fallback — since it's a plain untyped string over the wire, this is not a breaking change for the live UI, but Kunle's local TS union type for `AiSuggestion.type` will need updating whenever the card UI is redesigned per this ticket's checklist.

**Rules-based MVP (no LLM call)** — every suggestion below is a deterministic rule over real data; nothing here calls Gemini. (For reference: `src/modules/ask-ai/services/geminiProvider.service.ts`'s `callGemini()` is a hardened, reusable wrapper — feature-flagged, rate-limited, retry/backoff — that a future LLM-generated version of this feature could call, injecting these same real metrics as prompt context. Not used yet, per the ticket's own "rules-based MVP first" guidance.)

| Category | Rule | Source data |
|---|---|---|
| `VACANCY` | Fires when any unit has `status: VACANT` | `Unit.status`, exact count/rate in the text |
| `REVENUE` | Fires only when a unit's `marketRent` is actually recorded **and** higher than `rent` | `Unit.rent` vs `Unit.marketRent` — silently skipped (not fabricated) when `marketRent` is unset, which the audit found is true for most units today since nothing currently writes to that field outside seed/import scripts |
| `RENEWAL_RISK` | Active tenancies with `leaseEnd` within 30 days, regardless of tenant standing | `Tenancy.leaseEnd` |
| `RETENTION` | Active tenancies with `leaseEnd` within 60 days **and** Good Standing status `ACTIVE` — the positive-framing counterpart to `RENEWAL_RISK`: reliable tenants worth prioritizing for renewal outreach | `Tenancy.leaseEnd` cross-referenced with `listGoodStandingForOrg()` |
| `TENANT_AT_RISK` | Tenants with Good Standing status `AT_RISK`/`PAUSED`/`SUSPENDED` | Reuses `listGoodStandingForOrg()` as-is — including its own `reasons[]` array, which already had a real "why" (e.g. `"Rent 45 days late"`, `"Active flag: lease violation"`) before this ticket; not reinvented |
| `LATE_RENT` | Tenants with `arrearsDays > 0` | Same `listGoodStandingForOrg()` call, filtered differently — avoids a second arrears query and any threshold drift from Good Standing's own numbers |
| `MAINTENANCE_CAPEX` | A unit with 3+ maintenance tickets in the last 6 months | `MaintenanceTicketModel` aggregation grouped by `unitId`, most-frequent `issueType` surfaced in the text |
| `OPERATING_PERFORMANCE` | A property's this-month rent collection rate drops below 90% | `UnitFinancialsModel.rentCollected` / `rentScheduled`, grouped by property |
| `GENERAL` | Empty-state fallback — zero properties (`"Add your first property..."`), or a portfolio with no risk signals at all (`"No urgent risk signals..."`, no invented percentage) | — |

**Reused rather than re-derived:** `TENANT_AT_RISK`/`LATE_RENT` call `listGoodStandingForOrg()` (`good-standing/services/goodStanding.service.ts`) directly instead of re-querying `UnitFinancialsModel.arrearsDays` and re-implementing the risk thresholds — Good Standing is the product's one canonical tenant-risk engine (`GOOD_STANDING_THRESHOLDS`), and duplicating its logic here would risk the two features drifting out of sync over time.

Every suggestion is capped at one per rule per request (not `.slice(0, 3)` like the old version — with 8 honest, mutually-relevant categories instead of 3 padded/fabricated ones, showing all that legitimately fire is more useful than arbitrarily truncating).

## Weekly Demo Proof — Backend Readiness Audit (P0)

Full audit of the 14 demo checklist items against the actual codebase (route/controller/service/model level), done before the demo rather than assumed. **13 of 14 were already genuinely backend-connected, RBAC-enforced, and Mongoose-persisted with no changes needed.** One concrete gap was found and fixed this pass.

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | Landlord login | 🟢 | `auth.controller.ts` `login()` — Passport local strategy, bcrypt against `User.passwordHash`, real JWT via `generateJwt`. Stateless — JWT strategy re-fetches `User.findById` on every request, nothing server-session-cached. |
| 2 | Tenant login | 🟢 | Same flow; `acceptPendingInvitesForEmail()` runs on every tenant login to self-heal any pending `TenantInvite`. |
| 3 | Property Manager role | 🟢 | `PropertyManagerAssignmentModel` + 37-flag `PMPermission` enum + `hasPMAccess()`/`assertPMPermission()` enforced across ~30 PM routes. Org membership alone is deliberately never sufficient (by design, per longstanding code comment). Note for demo scripting: PM accounts are created via landlord-assignment or independent-PM invite, not public self-registration. |
| 4 | Clickable landlord KPI card | 🟢 | `GET /api/landlord/reports/units?status=` (this session's Reports KPI ticket) is a real drilldown, not frontend-only — filters real `UnitModel` rows by status, org-scoped. |
| 5 | Property-level financial snapshot | 🟢 | `GET /api/landlord/finances` — real `UnitFinancialsModel` rows per property. |
| 6 | Tenant roster sorting by lease-months-remaining / days-late | 🟢 **(fixed this pass)** | Was 🟡 — `GET /api/landlord/tenants` had the underlying data (`arrearsDays`, `leaseEnd`) but no `sortBy`/`sortDir` query params; only `.sort({_id:-1})` cursor pagination existed, so sorting could only ever happen client-side, and only within one fetched page. Fixed in `landlordTenants.service.ts`: added `sortBy: 'leaseEnd'\|'arrearsDays'` + `sortDir: 'asc'\|'desc'`. Since `arrearsDays` is a joined field (from `UnitFinancialsModel`, not on `Tenancy` directly), a true DB-level sort isn't possible without restructuring the join — instead, when `sortBy` is set, up to 500 matching tenancies are fetched, fully joined, sorted in-memory, then truncated to `limit`. `nextCursor` is always `null` in sorted mode (demo/portfolio-scale roster sizes; "sorted + paginated" is listed below as follow-up work, not needed for this demo). |
| 7 | Program configuration (RPA/TEPA/BOTH) | 🟢 | `ProgramConfigModel`, real CRUD, ORG→PROPERTY→UNIT→TENANT scope inheritance. |
| 8 | Tenant invite tied to property/unit | 🟢 | `TenantInviteModel` requires `propertyId`/`unitId`; `acceptInviteByToken()` activates a real `Tenancy` + sets `Unit.status = OCCUPIED`. Demo-script note: the invited email must already have a registered `User` account before the link is clicked (invite activates an existing account's tenancy, it does not create the account) — script the demo as register-then-accept, not "click link → instant account." |
| 9 | Compliance document upload/status | 🟢 | `ComplianceDocumentModel`, 10 document types, real S3 (or local-disk fallback) upload, 6-state status machine. |
| 10 | Reward campaign creation + tenant reward submission | 🟢 | `CampaignModel` + `RewardVerificationModel`, full 8-state review/dispute lifecycle, not stubbed. |
| 11 | Maintenance request (tenant submit + landlord/PM update) | 🟢 | Both paths write to the same real `MaintenanceTicketModel`; PM path is permission-gated (`SUBMIT_MAINTENANCE_UPDATES`/`MAINTENANCE_AWARD_REWARD`); both call `notify()` and write `AuditEvent`/`ActivityModel`. |
| 12 | Chat with PM + landlord direct-chat toggle | 🟢 | PM thread creation checks `hasPMAccess(...,'MESSAGE_TENANT'\|'MESSAGE_LANDLORD')` before creating a thread; direct-chat toggle is a real persisted `Organization.settings.allowDirectTenantMessaging` flag, enforced in `chat.service.ts`, not a UI-only switch. |
| 13 | Notification generated from real activity | 🟢 | `notify()` is called from 9 real service files (agreements, rewards, maintenance ×2, PM ops, chat, Stripe payments, tenant actions) — confirmed activity-driven, not test-only. |
| 14 | Export button on at least one table | 🟢 | `GET /api/exports/:dataset` — `tenant-roster`/`arrears`/`maintenance`/`token-ledger`/`activity-log` all build CSVs from live queries. **Known bug, do not demo:** the `stakeholders` dataset (`dataExport.controller.ts`) is a hardcoded placeholder string ("Stakeholder exports are not yet available in this version.") instead of real data — use any of the other 5 datasets for this checklist item instead. |
| — | Refresh/logout/login persistence (methodology, not a single feature) | 🟢 | JWT is fully stateless (no server session store); no module-level in-memory `Map`/array data stores found anywhere in `src/modules` — every feature above reads MongoDB fresh on every request, so a refresh/logout/login cycle proves nothing was faked. **Operational check before the live demo (not a code issue):** confirm `AWS_S3_BUCKET` is actually configured on the demo host — if unset, uploads (compliance docs, maintenance attachments) silently fall back to local-disk storage, which survives a refresh/relogin on the same running process but **not** a redeploy or an ephemeral-filesystem host. |

### Known bugs (for the ticket's "Known bugs listed" checklist item)
1. `stakeholders` CSV export dataset is a hardcoded placeholder, not real data (item 14 above) — separate follow-up ticket, not fixed this pass since it needs a real stakeholder/investor data source to back it (see also: no named-investor entity exists in this product, per the AI Suggestions and Reports KPI tickets' findings).
2. Tenant roster sorted mode (`sortBy` set) doesn't support cursor pagination past 500 rows — fine for any demo-scale or realistic current portfolio size, but flagged for the next-week plan below.

### Next week work plan (for the ticket's "Next week work plan listed" checklist item)
1. Add true cursor/offset pagination on top of sorted tenant-roster mode, if any landlord portfolio approaches the 500-row fetch cap.
2. Decide on a real data source for the `stakeholders` export (or drop it from the exportable-dataset list if it's not a near-term priority) — needs a product decision on whether "stakeholders" maps to community/investor users or something else, given no dedicated entity currently exists.
3. Verify `AWS_S3_BUCKET` is set in whichever environment hosts the live demo, so uploaded files are confirmed durable across a redeploy, not just a same-process refresh.

## Cross-Ticket Backend Audit (7 tickets: Export, Chat, PM Role, PM Notes, Maintenance, Rewards Campaign, TEPA Ledger)

Full re-audit of 7 additional tickets against actual code, done the same way as the Weekly Demo Proof audit above. **Two real, fixable bugs found and fixed this pass; everything else across all 7 tickets was already genuinely implemented.**

### Fixed this pass
1. **Chat RBAC gap (blocked a P0 acceptance criterion):** `property_manager`/`PROPERTY_MANAGER` was missing from `CHAT_ALLOWED_ROLES` (`src/modules/chat/constants/allowedRoles.ts`) — the route-level role gate on `GET/POST /api/chat/threads/:id/messages` rejected property managers with a 403 even though the service layer (`canAccessConversation`/`canSendMessage`) already correctly scoped access to actual thread participants. Net effect: a PM could create a thread with a tenant but then couldn't send or read messages in it — a direct break of "Property manager can reply to tenant." Fixed by adding both role-casing variants to the allow-list; the existing per-conversation participant check is untouched and still the real authorization boundary.
2. **Dropped `phone` field on independent PM registration:** `registerIndependentPM()` (`src/modules/property-manager/services/independentPropertyManager.service.ts`) accepted `input.phone` in its DTO but never wrote it to `User.create({...})`. Fixed — now persisted to `User.phone`.

### Verified already complete (no code changes)
- **Export Functionality** — all 11 required CSV export types (Portfolio, Financial Snapshot, Tenant Roster, Arrears, Rewards History, Token Ledger, Compliance, Maintenance, Debt, Activity Log, Agreement Status) are real, DB-backed, in `dataExport.controller.ts`. **Known gaps** (not fixed, flagged for follow-up): the `stakeholders` dataset remains a hardcoded placeholder (already known from the Weekly Demo Proof audit); exports don't accept any filter query params (`propertyId`, etc.) — every export always dumps the full org regardless of what filter was active on screen; there is no tenant-facing export endpoint at all (route is landlord/admin-only), despite the ticket title naming "Landlord **and Tenant** Dashboard Tables."
- **Property Manager Role/Assignment/Notes/Dashboard** — `PropertyManagerAssignmentModel`, the 37-flag `PMPermission` enum, invite/OTP activation flow, and per-property scoping (`hasPMAccess`) are all real and enforced. All 9 required permissions map to real flags.
- **Property Management Notes** — `PropertyNoteModel` matches all 8 required fields and the exact 6-value `noteType` enum (Property/Tenant/Maintenance/Renewal/Payment/Compliance), with a genuine two-tier permission model (landlord full CRUD; PM scoped to assignment + explicit `UPLOAD_NOTES` permission, forced to `LANDLORD_AND_PM` visibility, never sees `LANDLORD_ONLY` notes). One stale/misleading code comment in `notes.routes.ts` implies PM support isn't built when it actually is (built as a separate route family) — worth a cleanup pass, not a functional bug.
- **Maintenance Workflow End-to-End** — single shared `MaintenanceTicketModel` across tenant/landlord/PM paths, real S3/local uploads with ownership-checked signed URLs, reward-eligibility marking connects to a real idempotent ledger credit, activity log + notifications fire on both submit and update. Minor wording-only deviations from the ticket: no literal `landlordId` field (derived via org ownership instead), and one extra internal `CLOSED` status beyond the 5 named ones.
- **Rewards Campaign Builder / RPA Workflow** — the cleanest match of all 7: all 12 required eligible behaviors, all 6 reward types, and all 8 verification statuses map 1:1 to real enum values with no renaming. `LedgerKind.REWARD` vs `LedgerKind.OWNERSHIP` is enforced at the type level, so no RPA reward can be mislabeled as a TEPA token.
- **TEPA Equity Credits / Token Ledger / Valuation / Liquidity** — 13 real `TokenLedgerEntryType` values cover all 10 required event types (plus 3 extra). Vesting math is a genuine unit-tested pure function, not hardcoded. Annual valuation and liquidity request are complete multi-step workflows with real ledger side-effects, and tenant/landlord dashboards provably read the same underlying calculation functions (`getVestingSummary`, `listTokenLedgerEntries`). One minor gap left as-is: submitting a liquidity request doesn't itself auto-emit a `LIQUIDITY_REQUEST`-typed ledger entry (only later stages — deduction, transfer — write ledger entries); the `LiquidityRequestModel` row is still created and the full review/approve/deduct/transfer lifecycle works.

## Landlord dashboard / overview

| Component | Endpoint | Status |
|---|---|---|
| Portfolio KPI cards | `GET /api/landlord/dashboard?range=12m` | ✅ |
| Financial snapshot (monthly) | `GET /api/landlord/finances?month=YYYY-MM` | ✅ |
| Notifications bell | `GET /api/landlord/notifications` + `POST .../mark-read` | ✅ |
| AI suggestions | `GET /api/landlord/ai-suggestions` | ✅ |
| Debt summary | `GET /api/landlord/debt` | ✅ |
| Reports summary | `GET /api/landlord/reports` | ✅ |

## Tenant roster (landlord)

| Component | Endpoint | Status |
|---|---|---|
| Roster table (incl. leaseStart/End, arrearsDays, arrearsAmount, credits) | `GET /api/landlord/tenants` | ✅ sortable by lease-left + days-late in FE |
| Invite tenant | `POST /api/landlord/tenants/invite` | ✅ |
| Remove tenant | `DELETE /api/landlord/tenants/:tenantUserId` | ✅ |
| TEPA toggle | `PATCH /api/landlord/tenants/:tenantUserId/tepa` | ✅ |
| Adjust rewards | `POST /api/landlord/tenants/:tenantUserId/rewards` | ✅ |

## Property detail (landlord)

| Component | Endpoint | Status |
|---|---|---|
| Detail + units + program | `GET /api/landlord/properties/:propertyId` (+ `/units`, `/program`, `/valuation`, `/financing`) | ✅ |
| **Notes tab** (6 note types, visibility) | `GET/POST /api/landlord/notes` · `PATCH/DELETE /api/landlord/notes/:noteId` | ✅ |
| Compliance docs | `GET /api/landlord/compliance` + `PATCH .../documents/:docId/status` | ✅ |

## Agreement / Document Status (NEW — P1 Lease/RPA/TEPA tracking)

**Note:** "Compliance docs" above (`landlordComplianceUpdate.controller.ts`) tracks OCR-pipeline upload processing status (`PROCESSING/NEEDS_REVIEW/COMPLETED/FAILED` on the generic `DocumentModel`) — it is unrelated to agreement signing status and was not touched. Before this ticket, whether a tenant had signed the Lease/RPA/TEPA was fragmented across `Tenancy.status`, `TenantParticipationModel` enrollment fields, and `TepaEnrollment.status` — none tracked an uploaded signed file, a sent/viewed/signed lifecycle, or an effective date in one place, and neither `signedDocuments` nor `documentTemplates` (both named in this file's canon collection list) existed anywhere.

New `AgreementModel` (collection `signed_documents`) — one row per tenant + unit + `agreementType` (`LEASE`/`RPA`/`TEPA`), `status` progresses `NOT_STARTED → SENT → VIEWED → SIGNED → ACTIVE → TERMINATED`. A `SIGNED` row is reported as `ACTIVE` once `effectiveDate` has actually arrived — computed at read time, not a stored mutation a scheduled job has to run.

| Component | Endpoint | Notes |
|---|---|---|
| Tenant: list own agreements | `GET /api/tenants/agreements` | Lease always included; RPA/TEPA only "if applicable" to the property's `participationModel`. Missing rows are lazily created as `NOT_STARTED` |
| Tenant: view/download one | `GET /api/tenants/agreements/:agreementId` | Auto-transitions `SENT → VIEWED`; returns a signed document URL if one is uploaded |
| Landlord: status across the org | `GET /api/landlord/agreements?propertyId=&unitId=&tenantUserId=&agreementType=` | Which tenants have signed RPA/TEPA/Lease and which haven't, joined with tenant/property/unit names |
| Landlord: upload a file | `POST /api/landlord/agreements/upload` (multipart) → `{ fileKey, fileName, fileType }` | |
| Landlord: attach to an agreement | `POST /api/landlord/agreements/upload-signed` `{ tenantUserId, propertyId, unitId, agreementType, document, effectiveDate?, signedAt? }` | Sets `SIGNED` (or `ACTIVE` if effective immediately); creates the row if it doesn't exist |
| Landlord: manual status change | `PATCH /api/landlord/agreements/:agreementId/status` `{ status: SENT\|TERMINATED }` | |
| Landlord: view a document | `GET /api/landlord/agreements/:agreementId/file` | |
| PM: read-only status | `GET /api/property-manager/tepa/properties/:propertyId/agreements` | `TEPA_VIEW`-gated |
| Export | `GET /api/exports/agreement-status` | Updated to include per-agreement `LeaseStatus/LeaseSignedAt/LeaseEffectiveDate`, `RPAStatus/RPASignedAt`, `TEPAStatus/TEPASignedAt` columns alongside the pre-existing enrollment/lease-date columns |

**"TEPA does not show active unless signed/active" acceptance criterion:** `getVestingSummary` (used by the tenant vesting card, and now both the landlord's and PM's tenant-TEPA views) now includes a `tepaAgreementActive` boolean, computed directly against this `AgreementModel` — the one authoritative signal for gating TEPA UI, independent of the three older/looser participation flags.

## Compliance Center (NEW — P1 Make Compliance Center Clickable and Add Required Document Types)

**Before this ticket:** the existing `GET /api/landlord/compliance` (`landlordCompliance.service.ts`) only recognized 5 loosely-named documents ("RPA Agreement", "Owner Attestation", "Deed Document", "Mortgage Statement", "TEPA Disclosure") — none of the ticket's 10 required types — matched against the generic OCR-pipeline `DocumentModel.type` free-text field via a fragile `.includes()` substring check. There was no `tenantId` dimension at all (`DocumentModel` has no such field), no "Expired" status, and `VIEW_COMPLIANCE_STATUS` (a PM permission flag that's existed since Sprint B) had zero endpoint enforcing it. That old endpoint is left as-is (not touched) — this ticket's `ComplianceDocumentModel` is a new, separate, purpose-built system with real per-type/per-tenant records and the ticket's exact 6-status vocabulary.

**Deliberately kept separate from `AgreementModel`** (the Lease/RPA/TEPA signing tracker from the previous ticket), even though 3 of the 10 types overlap — Agreement tracks whether a *tenant* has signed (`SENT/VIEWED/SIGNED/ACTIVE/TERMINATED`); this tracks whether the *landlord* has uploaded/reviewed a compliance copy (`MISSING/UPLOADED/PENDING_REVIEW/APPROVED/REJECTED/EXPIRED`) — related but genuinely different concerns, same reasoning as the two separate campaign systems from the rewards ticket.

New `ComplianceDocumentModel` (collection `compliance_documents`): one record per `propertyId` + `documentType`, plus `tenantId` for the 3 tenant-scoped types (`LEASE_AGREEMENT`/`RPA_AGREEMENT`/`TEPA_AGREEMENT` — one row per active tenant); the other 7 types (`INSPECTION_REPORT`/`RENTAL_LICENSE`/`PROPERTY_INSURANCE`/`MORTGAGE_DEBT_DOCUMENT`/`PROPERTY_TAX_DOCUMENT`/`CITY_LICENSING_DOCUMENT`/`OTHER_SUPPORTING_DOCUMENT`) are property-wide (`tenantId: null`). Listing a property lazily creates any missing rows as `MISSING`, so every required type always has a real, queryable record — never a computed placeholder. An `APPROVED` document is reported as `EXPIRED` once `expiresAt` has passed, computed at read time.

| Component | Endpoint | Notes |
|---|---|---|
| Landlord: list (Compliance Center) | `GET /api/landlord/compliance-documents?propertyId=&status=&documentType=` | Org-wide if no `propertyId`. Each row has a `viewUrl` (null = "click to upload", set = "click to view") — the data the "clickable compliance alert" UI routes on |
| Landlord: aggregation | `GET /api/landlord/compliance-documents/summary?propertyId=` | `{ totalDocuments, byStatus: { MISSING, UPLOADED, PENDING_REVIEW, APPROVED, REJECTED, EXPIRED } }` |
| Landlord: upload file | `POST /api/landlord/compliance-documents/upload` (multipart) → `{ fileKey, fileName, fileType }` | |
| Landlord: attach to a record | `POST /api/landlord/compliance-documents/upload-complete` `{ propertyId, tenantId?, documentType, document, expiresAt? }` | Sets `UPLOADED`; `tenantId` required for the 3 tenant-scoped types, rejected (400) otherwise |
| Landlord: review | `PATCH /api/landlord/compliance-documents/:id/status` `{ status: PENDING_REVIEW\|APPROVED\|REJECTED\|EXPIRED, rejectionReason?, expiresAt? }` | `rejectionReason` required when rejecting |
| Landlord: view/download | `GET /api/landlord/compliance-documents/:id/file` | |
| PM: read-only | `GET /api/property-manager/compliance/properties/:propertyId` | `VIEW_COMPLIANCE_STATUS`-gated — closes a dead permission flag that had no enforcing endpoint since Sprint B |

**Not built:** the actual click-through routing (Kunle's job — "clicking a compliance alert takes the landlord to the relevant document/upload screen" is a frontend concern). The backend supplies everything needed for it: each list row's `id`, `documentType`, `propertyId`, `tenantId`, and `viewUrl`.

## Maintenance

| Component | Endpoint | Status |
|---|---|---|
| Tenant submit (with `issueType`) | `POST /api/tenants/maintenance` + `/upload` | ✅ |
| Tenant list (has `statusLabel`, `rewardDecision`, `notes[]`) | `GET /api/tenants/maintenance` | ✅ |
| Landlord list/manage (`rewardEligible`, `rewardDecision`, 6 statuses) | `GET /api/landlord/maintenance` + `PATCH /api/landlord/maintenance/:ticketId` | ✅ |
| **Landlord completion-evidence upload (NEW)** | `POST /api/landlord/maintenance/upload` (multipart, returns `fileKey`/`fileName`/`fileType` — pass into the PATCH's `attachments[]`) | 🟢 |
| **PM maintenance list (NEW)** | `GET /api/property-manager/maintenance?orgId=&propertyId=` (`MAINTENANCE_VIEW`-gated, unit-restriction honored) | 🟢 |
| **PM completion-evidence upload (NEW)** | `POST /api/property-manager/maintenance/upload` | 🟢 |

**Gaps closed (P0 - Complete Maintenance Workflow End-to-End):** a landlord/PM's `note` on `PATCH .../maintenance/:ticketId` used to only survive as the credit-ledger description when credits were also awarded — otherwise it was silently discarded. `notes` is now a persisted array on `MaintenanceTicketModel` (`text`, `authorId`, `authorRole`, `createdAt`), returned to tenant, landlord, and PM alike. Every landlord/PM update also now fires an `ActivityModel` event (`MAINTENANCE_UPDATED`) — previously only the tenant's initial submission was logged, so a PM-driven status change never appeared in the landlord's Activity tab. `attachments[]` is now also accepted on both update endpoints (for completion evidence), backed by the two new upload routes above.

## Chat

| Component | Endpoint | Status |
|---|---|---|
| Threads / messages / attachments | `GET /api/chat/threads`, `GET/POST .../messages`, `POST /api/chat/upload` | ✅ |
| Start thread | `POST /api/chat/threads/with/:userId` (enforces landlord toggle for tenants) | ✅ |
| Landlord direct-chat toggle | `GET/PATCH /api/landlord/chat-settings` | ✅ |
| Tenant threads (+`allowDirectLandlordChat` flag) | `GET /api/tenants/chat/threads` | ✅ |
| Tenant → landlord contact (New Chat) | `GET /api/tenants/chat/landlord-contact` | ✅ |

## Rewards (RPA)

| Component | Endpoint | Status |
|---|---|---|
| Catalog / redeem / redemptions | `GET /api/tenants/rewards`, `POST .../:rewardId/redeem`, `GET .../redemptions` | ✅ |
| Landlord approval queue | `GET /api/landlord/rewards/redemptions/pending` + `PATCH .../:id/review` | ✅ |
| Campaigns / challenges | `GET/POST/PATCH /api/landlord/campaigns`, `/api/landlord/challenges` | ✅ |

### Campaign builder expansion (P1 - Rewards Campaign Builder, NEW)

**Important architecture note:** two separate campaign systems exist in this codebase. `GET/POST/PATCH /api/landlord/campaigns` (the `campaign` module, `CampaignModel`, BE-205) is the real, event-triggered engine the landlord dashboard wizard actually calls — it already had duration (`startsAt`/`endsAt`), budget (`budgetUsd`), and status (`ACTIVE/PAUSED/ENDED`). A second, separate `RewardsCampaignModel` (`rewardsCampaigns` module) backs the PM's `POST /api/property-manager/rpa/campaigns` and the landlord "program" detail view (`landlordProgram.service.ts`) — these were NOT unified in this change (too large a migration to do safely alongside the rest of this ticket), but both were expanded in parallel so neither is left behind:

| Change | Where |
|---|---|
| Eligible behaviors expanded from 2 → 12 | `CampaignTriggerEvents` (`campaign` module) and `RewardsCampaignEligibleBehaviors` (`rewardsCampaigns` module) — both now include: on-time rent, early rent payment, lease renewal, maintenance reported early, HVAC filter replacement photo, moisture/leak check, safety alert response, survey completed, paperless enrollment, community participation, tenant referral, good unit care verification |
| `rewardType` field added | Both `CampaignModel` and `RewardsCampaignModel` — enum `POINTS \| GIFT_CARD \| RENT_CREDIT \| UTILITY_CREDIT \| SERVICE_CREDIT \| RECOGNITION_BADGE` (default `POINTS`), defined once in `src/modules/rewards/types/rewardType.ts` |
| Duration added to the PM/program system | `RewardsCampaignModel` gained `startDate`/`endDate` (the `campaign` module already had `startsAt`/`endsAt`) |
| `rewardsCampaigns` controller fixed | Was calling `res.json()` directly, bypassing the required `successResponse`/`errorResponse` envelope — now uses it |

**Known naming issue (flagged, not fixed):** `CampaignModel.budgetTokenCap` / `tokensIssued` (campaign metrics) use "token" in their names — a holdover from before RPA/TEPA were split. Functionally this is fine (confirmed below), but per this ticket's "remove tokens language" requirement, a coordinated rename with Kunle's frontend (which reads these exact field names) would be needed — not done here to avoid a breaking API change without frontend coordination.

**RPA/TEPA separation — verified, not a gap:** `issueCreditsToTenant` (used by every reward-issuance path, including the new verification workflow below) writes to `UnifiedLedgerEntryModel` with `ledgerKind: 'REWARD'`, which is structurally separate from TEPA ownership entries (`ledgerKind: 'OWNERSHIP'`, written only via `appendOwnershipLedgerEntry`). No RPA reward ever touches an ownership/TEPA ledger entry — this acceptance criterion was already satisfied at the data-model level.

### Reward verification workflow (NEW module: `rewardVerifications`)

The actual submit → verify → approve/deny → dispute → resolve pipeline the ticket asks for — this did not exist anywhere before (the pre-existing `TenantChallenge`/`ChallengeParticipation` system is a similar but separate claim-a-challenge flow with only 6 statuses and no dispute step; left as-is).

Full 8-status lifecycle: `ELIGIBLE → SUBMITTED → PENDING_VERIFICATION → APPROVED/ISSUED` or `DENIED → DISPUTED → RESOLVED`. `APPROVED` is a defined enum value reserved for a future decoupled fulfillment queue — today, approval and credit issuance happen atomically in one call, straight to `ISSUED`.

| Component | Endpoint | Notes |
|---|---|---|
| Tenant: list own history | `GET /api/tenants/rewards/verifications` | |
| Tenant: submit proof | `POST /api/tenants/rewards/verifications` `{ propertyId, unitId?, campaignId?, eligibleBehavior, rewardType?, proofNote?, attachments?, creditsRequested? }` | Requires an active tenancy at the property; transitions a matching `ELIGIBLE` row to `SUBMITTED` if one exists, else creates fresh |
| Tenant: dispute a denial | `POST /api/tenants/rewards/verifications/:id/dispute` `{ disputeReason }` | Only from `DENIED` |
| Landlord: list | `GET /api/landlord/rewards/verifications?propertyId=&status=&tenantUserId=` | |
| Landlord: pre-flag eligibility | `POST /api/landlord/rewards/verifications` `{ propertyId, tenantUserId, eligibleBehavior, ... }` | Creates `ELIGIBLE` |
| Landlord: start review | `PATCH /api/landlord/rewards/verifications/:id/start-review` | `SUBMITTED → PENDING_VERIFICATION` |
| Landlord: approve/deny | `PATCH /api/landlord/rewards/verifications/:id/review` `{ action, creditsAwarded?, denialReason? }` | Approve issues credits via the ledger (REWARD kind) → `ISSUED`; deny → `DENIED` |
| Landlord: resolve dispute | `PATCH /api/landlord/rewards/verifications/:id/resolve-dispute` `{ outcome: UPHOLD\|OVERTURN, creditsAwarded?, resolutionNote? }` | Overturn issues credits |
| PM: same 5 actions | `GET/POST /api/property-manager/rpa/verifications`, `PATCH .../:verificationId/review`, `PATCH .../:verificationId/resolve-dispute` | Reuses existing `RPA_VIEW` (list) / `RPA_CREATE_CAMPAIGN` (mark eligible) / `RPA_APPROVE_REDEMPTION` (review, resolve) permissions — no new PM permission flags added |

## Tokens / TEPA

| Component | Endpoint | Status |
|---|---|---|
| Tenant token summary + activity | `GET /api/tenants/tokens/summary`, `GET /api/tenants/tokens/activity` | ✅ |
| Ownership credits history | `GET /api/tenants/ownership-credits` | ✅ |
| **Vesting summary** (total/vested/unvested tokens, token value, next vesting date) | `GET /api/tenants/tokens/vesting` | 🟢 endpoint live, FE card pending |
| Monthly accrual run (landlord/admin, idempotent per period, dry-run default) | `POST /api/landlord/tokens/accrual/run?dryRun=false` `{ period: "YYYY-MM" }` | 🟢 |
| Token ledger entries (event types: accrual, purchase, **spot_purchase** (NEW), **incentive_token** (NEW), adjustment, forfeit, vesting, valuation_update, liquidity_request, approved_deduction, correction, transfer_request, **vested_token_payment_right** (NEW)) | ledger routes | 🟢 |

### P1 - TEPA Equity Credits, Token Ledger, Annual Valuation, Liquidity (NEW)

**Security fix (found while auditing this ticket, not something this ticket asked for):** `POST /api/ledger/entry` — the raw token-ledger-entry write endpoint — had `authMiddleware` only, **no role restriction at all**. Any authenticated user, including a tenant, could POST an arbitrary token delta for any tenant/property. Now gated `requireRole(['landlord', 'admin'])`.

**Annual Valuation — was completely missing.** Only a single static `Property.valuationUsd` field existed (no history, date, method, or source), despite `valuation_snapshots`/`valuationSnapshots` being a named canonical collection. New `ValuationSnapshotModel` (`valuationUsd`, `method: APPRAISAL|BPO|AVM`, `source: MANUAL|ZILLOW|REDFIN|CORELOGIC|OTHER`, `effectiveDate`, `notes`) plus a due/overdue status computation (`CURRENT` / `DUE_SOON` / `OVERDUE` / `NONE`, annual cadence). Recording a valuation keeps `Property.valuationUsd` in sync and writes a zero-token `VALUATION_UPDATE` ledger entry per active tenant on the property, so the event is visible on both dashboards.

| Component | Endpoint | Notes |
|---|---|---|
| Landlord: record a valuation | `POST /api/landlord/properties/:propertyId/valuations` `{ valuationUsd, method, source?, effectiveDate?, notes? }` | Writes `VALUATION_UPDATE` ledger entries for every active tenant |
| Landlord: history + status | `GET /api/landlord/properties/:propertyId/valuations` | `{ history[], status, latest, nextDueDate }` — distinct from the pre-existing `GET .../valuation` (a single derived current-estimate view with no history) |
| Tenant: own property's status | `GET /api/tenants/tepa/valuation` | Backs "Annual Valuation Date" on the tenant TEPA card |
| PM: read-only | `GET /api/property-manager/tepa/properties/:propertyId/valuation` | `TEPA_VIEW`-gated, reuses the same status computation |

**Landlord had no way to see a tenant's token ledger — at all.** Only a Property Manager (via `TEPA_VIEW`) could see a tenant's vesting summary or token ledger; the landlord dashboard had zero equivalent endpoint, directly contradicting the acceptance criterion "ledger entry appears on both tenant and landlord dashboards."

| Component | Endpoint |
|---|---|
| Landlord: tenant vesting summary | `GET /api/landlord/tepa/tenants/:tenantUserId` |
| Landlord: tenant token ledger | `GET /api/landlord/tepa/tenants/:tenantUserId/ledger?propertyId=` |

**Economic Participation % language fix:** the tenant dashboard response (`tenantDashboard.service.ts`) returned this block as `ownershipParticipation` — literal "ownership" language, violating this ticket's explicit acceptance criterion. Added `economicParticipation` as an identical-shape field alongside it (kept `ownershipParticipation` for backward compatibility until Kunle migrates reads to the new key, then it can be deleted).

**Liquidity request workflow — already fully built, not a gap.** Submit → review (UNDER_REVIEW/APPROVED/DENIED) → deductions → ROFR decision → transfer status → completion (writes `APPROVED_DEDUCTION` + `TRANSFER_REQUEST` ledger entries, now also a `VESTED_TOKEN_PAYMENT_RIGHT` informational entry) all existed before this ticket (`src/modules/liquidity`). Vested/unvested calculation (time-based monthly vesting, immediate vesting for purchases/spot-purchases/incentives) also already existed (`vesting.service.ts`) — both were only extended for the 3 new event types, not built from scratch.

## Exports (CSV) — all org-scoped, landlord/admin

`GET /api/exports/:dataset` — datasets:
`tenant-roster` · `arrears` · `token-ledger` · `rewards-history` · `compliance` · `maintenance` · `agreement-status` · `activity-log` · `properties` · `tenants` · `financials` · `loans` · **`debt`** (NEW) · **`portfolio`** (NEW)

`debt` (NEW) — per-loan CSV (property, lender, type, principal, rate, outstanding balance, monthly interest, LTV, repaid %, maturity), built from the same `PropertyFinancingModel`-backed service (`getLandlordDebt`) that powers `/api/landlord/debt` — not the older `loans` dataset, which is backed by a separate, simpler `LoanModel`. Closes the "Debt Report Export" gap from the P1 export ticket.

`portfolio` (NEW) — per-property overview CSV (name, status, city, state, type, total/occupied/vacant units, occupancy rate). Complements the existing PDF portfolio report (`POST /api/reports/portfolio`) with a CSV version for the "Portfolio Overview Export" requirement.

FE: ✅ "Export Data (CSV)" card on landlord Reports page + Export dropdown on Tenants page — **not yet wired to the two new datasets above** (frontend addition, not built in this pass). Compliance page's "Download Compliance Report" button is currently a no-op (no `onClick` at all) — separate frontend gap, flagged, not fixed here.
PDF: `POST /api/reports/portfolio`, `GET /api/reports/council-brief`.

**Remaining gap (not fixed):** none of these exports are reachable by the `tenant` role — the ticket title says "Landlord and Tenant Dashboard Tables" but `requireRole(['landlord','admin'])` gates the whole `/api/exports/:dataset` route. Flagging for a product decision on what a tenant should be able to export (their own payment history? Own token ledger?) before building tenant-side access.

## Tenant dashboard

| Component | Endpoint | Status |
|---|---|---|
| Summary / payments / property / tenancies | `GET /api/tenants/dashboard`, `/payments`, `/property`, `/tenancies` | ✅ |
| Notifications | `GET /api/tenants/notifications` + mark-read | ✅ |

### P1 - Rework Tenant Dashboard Structure and Top Cards (NEW)

**Real bug found and fixed:** `GET /api/tenants/dashboard`'s `ownershipCredits`/`ownershipParticipation` fields were built entirely from `CreditAccountModel`/`CreditEventModel` — which, per the unified ledger's `LedgerKind` discriminator, is the **RPA reward** ledger, not TEPA equity. There was no TEPA vesting/token data on this endpoint at all. The dashboard's "Equity Credits" was silently showing reward points. Fixed by adding two clearly separated, correctly-sourced fields (old fields kept for backward compatibility):

| New field | Source | Notes |
|---|---|---|
| `rewardsPoints: { balance, earnedToDate, earnedThisMonth }` | `CreditAccountModel` (RPA) | Same values `ownershipCredits` already had, correctly labeled |
| `equityCredits: { totalTokens, vestedTokens, unvestedTokens, tokenValueUsd, vestedValueUsd, tepaAgreementActive } \| null` | `getVestingSummary()` (TEPA) | `null` if the tenant has no active tenancy/TEPA participation — never fabricated zeros |
| `estimatedCreditValueChange: { changeUsd, changePercent, periodDays: 30 } \| null` | Vested-token count now vs. 30 days ago, × current `tokenValueUsd` | Measures token accumulation, not property valuation swings — a deliberate simplification, flagged for product to confirm this is the intended definition |
| `pathwayToHomeownership: { currentEquityValueUsd, propertyValueUsd, progressPercent } \| null` | `vestedValueUsd` ÷ `Property.valuationUsd` | **First-pass placeholder formula** — no milestone/threshold concept exists yet; this is "current equity value as % of total property value," not a defined product metric. Needs product sign-off before Kunle builds the real card |
| `documentsStatus: [{ agreementType, status, signedAt, effectiveDate }]` | `getTenantAgreements()` (from the Agreements ticket) | Lease/RPA/TEPA status in one place |
| `tokenLedgerPreview: [{ type, tokens, value, timestamp, source }]` (up to 5) | `listTokenLedgerEntries()` | Recent TEPA token ledger activity for a dashboard preview card |

**Not built:** "utility due" (mentioned in the ticket's backend responsibilities) — no utility billing model exists anywhere in the schema (`PaymentType` is only `RENT \| TOKEN_PURCHASE`); building one is a much larger undertaking than this ticket and is out of MVP scope per this file's own scope notes. Flagging rather than inventing a billing system.

**Already true, not a gap:** every query in `getTenantDashboard` is scoped by the authenticated `tenantUserId` — no cross-tenant data exposure. Response is real DB-backed (not cached/mocked), so it persists correctly across refresh/logout/login.

## Notifications & Activity Trail (NEW — P1 Build Notifications and Activity Trail)

**Before this ticket:** the "Notifications" row above (`GET /api/tenants/notifications`) is a **derived/computed feed**, not a persisted table — it re-derives "notifications" on every request from the current `MaintenanceTicketModel`/`TenancyModel` state, so a notification is silently overwritten once the underlying ticket's status moves on, and read/unread is a single global `lastReadAt` cursor per user, not per-notification. The landlord equivalent (`landlordNotifications.service.ts`) reads from `ActivityModel`, which is real but has no `recipientId`/`recipientRole`/`readStatus`/`eventTitle`/`eventDescription` fields and is only populated from a handful of action sites. Neither covers rewards, agreements, compliance, payments, or chat. Both are left as-is (not touched) — this ticket adds a new, separate, purpose-built system alongside them.

New `NotificationModel` (collection `notifications`) with exactly the ticket's required fields: `userId` (actor), `recipientId`, `recipientRole`, `landlordId`, `propertyId`, `unitId`, `tenantId`, `eventType`, `eventTitle`, `eventDescription`, `readStatus` (per-notification boolean), `createdAt`. Role-agnostic — the same endpoints serve tenant, landlord, property_manager, and admin recipients.

| Component | Endpoint |
|---|---|
| List (any role) | `GET /api/notifications?limit=&cursor=&unreadOnly=` → `{ notifications[], nextCursor, unreadCount }` |
| Unread count | `GET /api/notifications/unread-count` |
| Mark one read | `PATCH /api/notifications/:id/read` |
| Mark all read | `POST /api/notifications/mark-all-read` |

**Real backend-generated events wired at their actual action sites** (fire-and-forget via a `notify()` helper — never blocks or fails the triggering action):

| Event type | Wired at | Recipient |
|---|---|---|
| `TENANT_REGISTERED` | `landlordTenantActions.service.ts` `inviteTenant` + `propertyManagerOperations.service.ts` `addTenantForPM` (only when a *new* User is created, not on reuse) | Landlord (or the PM themself for independent RPA accounts with no landlord) |
| `MAINTENANCE_SUBMITTED` | `tenantMaintenance.service.ts` `submitMaintenanceTicket` | Landlord (org OWNER) |
| `MAINTENANCE_STATUS_CHANGED` | `landlordMaintenance.service.ts` `updateMaintenanceTicket` (only when `status` is part of the update) | Tenant |
| `REWARD_SUBMITTED` | `rewardVerification.service.ts` `submitVerification` | Landlord (org OWNER) |
| `REWARD_APPROVED` / `REWARD_DENIED` | `rewardVerification.service.ts` `reviewVerification` | Tenant |
| `RPA_SIGNED` / `TEPA_SIGNED` | `agreement.service.ts` `uploadSignedAgreement` (only for `agreementType` RPA/TEPA, not LEASE) | Tenant |
| `PAYMENT_STATUS_CHANGED` | `stripePayments.service.ts` `markPaymentFailed` / `markPaymentRefunded` / `markPaymentPaidAndAccrueTokens` | Tenant |
| `CHAT_MESSAGE_RECEIVED` | `chat.service.ts` `sendMessage` (alongside the existing real-time socket emit) | Every other participant with a supported role |

**Not wired** (named in the ticket's description examples but not its checklist): `TENANT_INVITE_ACCEPTED`, `PM_NOTE_ADDED`, `COMPLIANCE_DOCUMENT_UPLOADED`/`PENDING_REVIEW`, `PAYMENT_LATE` (30/60/90 days), `LEASE_EXPIRING`, `LIQUIDITY_REQUEST_SUBMITTED` — the `NotificationEventType` enum already includes all of these so wiring them later is additive, not a schema change. Prioritized the 6 categories the checklist explicitly named (tenant registration, maintenance, reward, agreement, payment status, chat) given the size of this ticket.

## Good Standing (NEW — Sprint B)

| Component | Endpoint | Status |
|---|---|---|
| Tenant standing badge (own status + reasons + eligibility) | `GET /api/tenants/good-standing` | 🟢 endpoint live, FE badge pending |
| Landlord standing list (all tenants) | `GET /api/landlord/good-standing` | 🟢 |
| Landlord standing detail | `GET /api/landlord/good-standing/:tenantUserId` | 🟢 |
| Flag tenant issue (EVICTION/LEASE_VIOLATION/DAMAGE_CLAIM/UNAUTHORIZED_OCCUPANT/FRAUD/OTHER) | `POST /api/landlord/good-standing/:tenantUserId/flags` | 🟢 |
| Resolve flag | `PATCH /api/landlord/good-standing/:tenantUserId/flags/:flagId/resolve` | 🟢 |
| Admin override (set/clear) | `PATCH /api/landlord/good-standing/:tenantUserId/override` (ADMIN only) | 🟢 |
| Roster: `goodStanding` field (ACTIVE/AT_RISK/PAUSED/SUSPENDED) | included in `GET /api/landlord/tenants` | 🟢 |

Statuses: `ACTIVE` / `AT_RISK` (1-30d late) / `PAUSED` (31-90d) / `SUSPENDED` (91+d, eviction, fraud, terminated tenancy). PAUSED/SUSPENDED block token accrual and reward redemption automatically.

## Program Configuration (NEW — Sprint B)

Hierarchy: **Organization → Property → Unit → Tenant**, field-level inheritance (unset = inherit from parent scope).

| Component | Endpoint | Status |
|---|---|---|
| Resolve effective config for a target | `GET /api/landlord/program-config/resolve?propertyId=\|unitId=\|tenancyId=` | 🟢 returns `{ programType, rewardRules, tokenRules, provenance, chain }` |
| List config documents | `GET /api/landlord/program-config?propertyId=` | 🟢 |
| Create/update a scope (ORG/PROPERTY/UNIT/TENANT) | `PUT /api/landlord/program-config` | 🟢 — used for the **Programs tab**: property-level defaults + tenant overrides |
| Delete an override (falls back to inherited) | `DELETE /api/landlord/program-config/:configId` | 🟢 |

`programType`: `NONE / RPA_ONLY / TEPA_ONLY / BOTH`. Legacy `property.participationModel` is honored as the PROPERTY-level default when no explicit config document exists yet — no migration needed. Tenant invites auto-pre-fill `participationModel` from the resolved config when the landlord doesn't pick one.

## Property Manager (Sprint B thin role → full epic Phase 1, 2026-07-20)

| Component | Endpoint | Status |
|---|---|---|
| Assign PM to a property (creates user if new) | `POST /api/landlord/property-managers` `{ email, firstName?, lastName?, propertyId, permissions? }` | 🟢 |
| List org's PM assignments | `GET /api/landlord/property-managers?propertyId=` | 🟢 |
| Revoke PM access to a property | `DELETE /api/landlord/property-managers/:assignmentId` | 🟢 |
| **Update one assignment's permissions/unit-restriction/group-chat (NEW)** | `PATCH /api/landlord/property-managers/:assignmentId/permissions` `{ permissions?, unitIds?, allowGroupChat? }` | 🟢 |
| PM's own assigned properties | `GET /api/property-manager/my-properties` (role: `property_manager`) | 🟢 |
| PM notes (read `LANDLORD_AND_PM`, write with `UPLOAD_NOTES` permission) | `GET/POST /api/property-manager/properties/:propertyId/notes` | 🟢 |
| PM's tenant contact list (for chat) | `GET /api/property-manager/tenant-contacts` | 🟢 |

PM access is per-property (Property A assignment ≠ Property B access) via a unique-active assignment row. See `docs/PROPERTY_MANAGER_EPIC_PLAN.md` for the full epic plan, permission matrix, and timeline.

**Ticket 9 (data-connection guarantee)** — verified, not new code: `listMyAssignments` queries `PropertyManagerAssignmentModel` by `propertyManagerUserId` only (not filtered by `source`), so landlord-invited and independent-RPA assignments surface through the same dashboard-seed endpoint with no duplication. Both paths write to the same canonical `Property`/`Membership` collections a landlord's own onboarding uses — no parallel PM-only copy of any record exists.

### Permission matrix (full — Phase 1, 2026-07-20)

`permissions` on an assignment is now one of ~38 flags (was 7). Full list in `propertyManagerAssignment.model.ts` (`PM_PERMISSIONS`). Categories: Property/Roster (`VIEW_PROPERTY`, `EDIT_PROPERTY`, `VIEW_UNITS`, `EDIT_UNITS`, `VIEW_TENANTS`, `ADD_TENANT`, `UPLOAD_TENANT_INFO`, `INVITE_TENANT`, `REMOVE_TENANT`, `VIEW_LEASE_TERMS`, `EDIT_LEASE_TERMS`, `VIEW_LEASE_DOCUMENTS`, `UPLOAD_LEASE_DOCUMENTS`, `VIEW_RENT_DATA`, `VIEW_ARREARS`), RPA (`RPA_VIEW`, `RPA_CONFIGURE`, `RPA_ENROLL_TENANT`, `RPA_CREATE_REWARD`, `RPA_CREATE_CAMPAIGN`, `RPA_CREATE_CHALLENGE`, `RPA_APPROVE_REDEMPTION`, `RPA_ADJUST_BALANCE`, `RPA_EXPORT`), TEPA (`TEPA_VIEW` — read-only, no write endpoints exist for PM at all), Maintenance (`MAINTENANCE_VIEW`, `SUBMIT_MAINTENANCE_UPDATES`, `MAINTENANCE_ASSIGN`, `MAINTENANCE_ADD_NOTES`, `MAINTENANCE_UPLOAD_ATTACHMENTS`, `MAINTENANCE_AWARD_REWARD`), Messaging/Notes (`MESSAGE_TENANT`, `MESSAGE_LANDLORD`, `UPLOAD_NOTES`, `UPLOAD_DOCUMENTS`), Reporting (`VIEW_REPORTS`, `VIEW_ACTIVITY_LOG`, `VIEW_COMPLIANCE_STATUS`, `EXPORT_REPORTS`).

**Default grant for a landlord-invited PM** (`DEFAULT_PM_PERMISSIONS`): view-only roster (`VIEW_PROPERTY`/`VIEW_UNITS`/`VIEW_TENANTS`/`VIEW_LEASE_TERMS`), full maintenance group, `MESSAGE_TENANT`/`MESSAGE_LANDLORD`, `UPLOAD_NOTES`, basic reporting (`VIEW_REPORTS`/`VIEW_ACTIVITY_LOG`/`VIEW_COMPLIANCE_STATUS`). **RPA and TEPA are never default-on for a landlord-invited PM** — both require explicit grant via the new PATCH endpoint above, even `RPA_VIEW`.

Independent RPA accounts (Ticket 6, not yet built) will get `INDEPENDENT_RPA_DEFAULT_PERMISSIONS` automatically instead — full roster + RPA + maintenance + messaging + reporting, never TEPA.

### Independent RPA onboarding (Ticket 6, NEW — Path A, no landlord invite)

| Component | Endpoint | Status |
|---|---|---|
| Register (public, sets own password — unlike landlord-invited PMs) | `POST /api/property-manager/independent/register` `{ email, password, firstName?, lastName?, phone?, companyName, companyAddress?, website?, propertiesManaged? }` → `{ authToken, refreshToken, user, orgId }` | 🟢 |
| Confirm authority to administer RPA (required once, before first property) | `POST /api/property-manager/independent/confirm-authority` | 🟢 |
| Create a property under own authority (auto-assigns full independent-RPA permission set, `participationModel` always `RPA_ONLY`) | `POST /api/property-manager/independent/properties` `{ name, address, type, totalUnits?, yearBuilt? }` | 🟢 |

Creates a real `Organization` (`type: LANDLORD_ORG`) for the PM's own operation, same scoping a landlord's org uses — a future landlord "claim" (admin-assisted, per Laurel's 2026-07-20 decision) only reassigns ownership, never migrates records. `403` from the create-property call if `confirm-authority` hasn't been called yet.

### Dashboard, records, and multi-landlord context (Tickets 10-12, NEW)

| Component | Endpoint | Status |
|---|---|---|
| Distinct landlord contexts for a multi-landlord PM | `GET /api/property-manager/context/landlords` → `{ landlords: [{ orgId, orgName, propertyCount, source }] }` | 🟢 |
| Dashboard summary cards, per-metric permission-gated | `GET /api/property-manager/dashboard/summary?orgId=` | 🟢 |
| Assigned properties (no debt/investor/equity/valuation fields) | `GET /api/property-manager/properties?orgId=` | 🟢 |
| Assigned units (rent only with `VIEW_RENT_DATA`; unit-level restriction honored) | `GET /api/property-manager/units?orgId=&propertyId=` | 🟢 |
| Tenant roster (with Good Standing status) | `GET /api/property-manager/tenants?orgId=&propertyId=` | 🟢 |
| Lease/tenancy list (`rentAmount` only with `VIEW_RENT_DATA`) | `GET /api/property-manager/leases?orgId=&propertyId=` | 🟢 |

`orgId` (the landlord context from `/context/landlords`) is required on every call above — stateless switching per Laurel's 2026-07-20 decision, no server-side session. Every list/summary metric is computed only from properties whose assignment grants the relevant permission; passing a specific `propertyId` the caller isn't permitted on returns `403`. `assignedProperties` is the only dashboard-summary field always present — everything else (units/tenants/leases/maintenance/messages/RPA/TEPA) appears only when at least one assigned property in that org grants the corresponding permission.

### Property Manager chat (Ticket 13, NEW — Phase 4)

| Component | Endpoint | Status |
|---|---|---|
| PM → landlord direct thread | `POST /api/property-manager/chat/landlord-threads` `{ propertyId }` → `{ threadId, isNew }` | 🟢 |
| PM + landlord + tenant 3-party group thread | `POST /api/property-manager/chat/group-threads` `{ propertyId, tenantUserId }` → `{ threadId, isNew }` | 🟢 |

Landlord identity for the direct thread is always derived server-side from the assignment record (`landlordUserId`), never taken from client input. Landlord thread requires `MESSAGE_LANDLORD`; group thread requires `MESSAGE_TENANT` **and** the assignment's `allowGroupChat: true` (off by default — landlord must enable via the permissions PATCH endpoint). Group thread also validates the tenant has an active tenancy on a unit within the property (respecting any unit-level restriction). Both `400` if the property has no landlord (independent RPA account — nothing to message).

### RPA administration (Phase 5, NEW)

All reuse the exact same underlying services/models the landlord-facing RPA endpoints use — no parallel reward/campaign/redemption system, only the org/property resolution differs (assignment + permission, never Membership/OWNER-ADMIN).

| Component | Endpoint | Permission |
|---|---|---|
| List reward catalog (org-wide — catalog entries aren't property-scoped) | `GET /api/property-manager/rpa/rewards?orgId=` | `RPA_VIEW` (any property in org) |
| Create reward catalog entry | `POST /api/property-manager/rpa/rewards?orgId=` | `RPA_CREATE_REWARD` (any property in org) |
| List campaigns (property-scoped) | `GET /api/property-manager/rpa/campaigns?orgId=&propertyId=` | `RPA_VIEW` |
| Create campaign | `POST /api/property-manager/rpa/campaigns` `{ propertyId, goal, budget, eligibleBehaviors }` | `RPA_CREATE_CAMPAIGN` on that property |
| List challenges (property-scoped) | `GET /api/property-manager/rpa/challenges?orgId=&propertyId=` | `RPA_VIEW` |
| Create challenge (`creatorType: PROPERTY_MANAGER`) | `POST /api/property-manager/rpa/challenges` | `RPA_CREATE_CHALLENGE` on that property |
| List pending redemptions (tenants on PM's properties only) | `GET /api/property-manager/rpa/redemptions/pending?orgId=` | `RPA_VIEW` |
| Approve/reject a redemption (approve triggers the same fulfillment flow — gift card/rent credit/service — as the landlord path) | `PATCH /api/property-manager/rpa/redemptions/:redemptionId/review?orgId=` `{ action, rejectionReason? }` | `RPA_APPROVE_REDEMPTION` |
| Adjust a tenant's reward balance with a required reason | `POST /api/property-manager/rpa/tenants/:tenantUserId/adjust-balance` `{ propertyId, amount, reason }` | `RPA_ADJUST_BALANCE` on that property |

**Not built yet:** tenant RPA enrollment (`RPA_ENROLL_TENANT`) — the existing landlord enrollment service (`upsertTenantParticipationForLandlord`) is tightly coupled to `resolveLandlordOrgId` (OWNER/ADMIN membership), so a PM-scoped equivalent needs a small refactor to export its internal tenancy-chain helper first. Flagged for a follow-up, not rushed into this batch.

### TEPA monitoring (Phase 6, NEW — strictly read-only)

No mutation endpoint exists anywhere in this section, by construction — vesting, token ledger, enrollment, Good Standing, and liquidity are all re-read from the exact same canonical sources the tenant/landlord views use.

| Component | Endpoint | Permission |
|---|---|---|
| Per-tenant TEPA summary (vesting, Good Standing, opt-in status, consent/agreement record) | `GET /api/property-manager/tepa/tenants/:tenantUserId?propertyId=` | `TEPA_VIEW` |
| Per-tenant token ledger (activity history) | `GET /api/property-manager/tepa/tenants/:tenantUserId/ledger?propertyId=` | `TEPA_VIEW` |
| Property-level TEPA participation rollup | `GET /api/property-manager/tepa/properties/:propertyId/summary` | `TEPA_VIEW` |
| Liquidity requests for tenants on this property (list only — no review/deduct/ROFR/transfer) | `GET /api/property-manager/tepa/liquidity?propertyId=` | `TEPA_VIEW` |

**Known data-model inconsistency (not introduced by this work, flagging for awareness):** tenant TEPA participation is tracked in three different places across the codebase — `Tenancy.tepaOptInStatus`, `TenantParticipationModel.tepaEnrollmentStatus`, and `TepaEnrollment.status`. This module uses `Tenancy.tepaOptInStatus` as the primary "is this tenant opted in" signal (same source the Phase 3 dashboard summary already uses, for consistency) and `TepaEnrollment` as the closest real "agreement/consent" record. Worth a product/architecture decision later on which is canonical.

### Reports & exports (NEW — property-scoped, not org-wide)

| Component | Endpoint | Permission |
|---|---|---|
| CSV export | `GET /api/property-manager/reports/:dataset?orgId=&propertyId=` | `EXPORT_REPORTS` (or `TEPA_VIEW` for `token-ledger`) |

### Operations — add tenant, update maintenance (NEW)

`ADD_TENANT` and `SUBMIT_MAINTENANCE_UPDATES` existed on the assignment's permission list from the start but had no endpoint enforcing them — a PM could be granted either flag and nothing would happen. Closed here by mirroring the landlord's own logic (`inviteTenant`, `updateMaintenanceTicket`) with PM-assignment scoping instead of `resolveLandlordOrgId`.

| Component | Endpoint | Permission |
|---|---|---|
| Add a tenant to a unit (creates tenancy `PENDING` + real accept-invite link, same as landlord flow) | `POST /api/property-manager/tenants` `{ unitId, email, rentAmount, leaseStart, leaseEnd }` → `{ tenancyId, tenantUserId, email, propertyName, inviteUrl }` | `ADD_TENANT` on the unit's property (+ unit-level restriction honored) |
| List maintenance tickets on assigned properties (NEW) | `GET /api/property-manager/maintenance?orgId=&propertyId=` | `MAINTENANCE_VIEW` |
| Update a maintenance ticket's status/notes, attachments, or award reward credits | `PATCH /api/property-manager/maintenance/:ticketId` `{ status?, note?, creditsToAward?, rewardEligible?, rewardDecision?, attachments? }` | `SUBMIT_MAINTENANCE_UPDATES`; touching any of `creditsToAward`/`rewardEligible`/`rewardDecision` additionally requires `MAINTENANCE_AWARD_REWARD` |
| Upload a completion-evidence file (NEW) | `POST /api/property-manager/maintenance/upload` (multipart) → `{ fileKey, fileName, fileType }` | `property_manager` role only — not property-scoped at upload time; the PATCH call still enforces `SUBMIT_MAINTENANCE_UPDATES` on the ticket's property |

`POST /tenants` returns `409` if the unit already has an active or pending tenancy. `PATCH /maintenance/:ticketId` scopes via the ticket's `propertyId` (and `unitId`, if set) — a PM without the base permission, or without `MAINTENANCE_AWARD_REWARD` when reward fields are present, gets `403`. `note` is now persisted onto the ticket's `notes[]` (previously silently dropped unless credits were awarded); every update also fires an `ActivityModel` event so PM-driven changes appear in the landlord's Activity feed, not just AuditEvent's internal trail.

Valid `dataset` values: `tenant-roster`, `arrears`, `lease-expiration`, `maintenance`, `rewards-history`, `token-ledger`, `activity-log`. Unlike the landlord's `/api/exports/:dataset` (org-wide), this only includes data from properties the PM is assigned to and permitted on — a specific `propertyId` the PM isn't permitted on returns `403`, and if no property grants the required permission the response is a one-line "No data" CSV rather than an error.

**Bug fixed while building this:** the landlord's `rewards-history` export (`dataExport.controller.ts`) resolves reward titles against the wrong model (`Reward` instead of `RewardCatalogModel` — `Redemption.rewardId` actually references `RewardCatalogModel._id` since that's what `redeemReward.service.ts` writes). The landlord export silently returns blank reward names; not introduced by this branch, not yet fixed there. This PM version resolves correctly against `RewardCatalogModel`.

**Not built yet:** `compliance` and `agreement-status` exports (the landlord equivalents are non-trivial to property-scope — `getLandlordCompliance`/`listLandlordTenants` are tightly coupled to `resolveLandlordOrgId`).

### New assignment fields (frontend-relevant)

- `unitIds?: string[] | null` — optional unit-level restriction on top of the property-level assignment. `null`/absent = whole property. Set via the PATCH endpoint.
- `allowGroupChat: boolean` — **defaults to `false`**. Must be explicitly turned on per-assignment (not org-wide) before a PM can create a 3-party landlord+PM+tenant thread. Existing `MESSAGE_TENANT`/`MESSAGE_LANDLORD` permission flags still gate 1:1 direct chat as before.
- `source: 'LANDLORD_INVITE' | 'INDEPENDENT_RPA'` — how the assignment was created.
- `status` now includes `PENDING` and `SUSPENDED` in addition to `ACTIVE`/`REVOKED` (manual-only for MVP — no automatic suspension trigger yet).

### Invitation management (Tickets 7-8, NEW — landlord-facing)

| Component | Endpoint | Status |
|---|---|---|
| Current invite status for one assignment | `GET /api/landlord/property-managers/:assignmentId/invite` → `{ status, email, sentAt, expiresAt, acceptedAt }` | 🟢 |
| Resend activation email + extend expiry | `POST /api/landlord/property-managers/:assignmentId/invite/resend` | 🟢 |
| Revoke the invite/login link (before acceptance) | `POST /api/landlord/property-managers/:assignmentId/invite/revoke` | 🟢 |

Invite `status` lifecycle: `SENT → OPENED` (PM viewed the link) `→ ACCEPTED`. Terminal: `DECLINED`, `EXPIRED`, `REVOKED`. Note "revoke invite" (blocks the login link, pre-acceptance) is distinct from `DELETE /api/landlord/property-managers/:assignmentId` (revokes an already-active PM's property access) — landlords may need both depending on where the PM is in the flow.

| PM-facing (public, token-based) | Endpoint |
|---|---|
| Decline an invitation | `POST /api/pm-invites/decline` `{ token }` |

### PM activation (passwordless — no `/api/auth/login` for PMs)

Assigning a PM auto-sends an activation email (or logs the link server-side if SendGrid isn't configured). No auth required for these 3 calls — mirrors the tenant OTP invite flow, no password is ever set.

| Component | Endpoint | Status |
|---|---|---|
| Check invite validity | `GET /api/pm-invites/verify?token=` → `{ email, propertyName }` | 🟢 |
| Send 6-digit code (rate-limited 60s) | `POST /api/pm-invites/send-otp` `{ token }` | 🟢 |
| Verify code → activate + get session | `POST /api/pm-invites/verify-otp` `{ token, otp }` → `{ authToken, user }` | 🟢 |

A second assignment to an already-`ACTIVE` PM does not re-trigger activation — they just see the new property on next login.

## Liquidity (NEW — Sprint C, record-and-track per Laurel Q2)

Lifecycle: `SUBMITTED → UNDER_REVIEW → APPROVED → DENIED/CANCELLED`. Once `APPROVED`: landlord adds deductions + records the ROFR decision, then moves `transferStatus` `NOT_STARTED → PENDING → COMPLETED`. Completing the transfer finalizes the request (`status → COMPLETED`) and writes ledger entries — **no on-platform payment**, this only tracks state.

| Component | Endpoint | Status |
|---|---|---|
| Tenant: submit request (validated against live vested balance) | `POST /api/tenants/liquidity` `{ tokens }` | 🟢 |
| Tenant: my requests | `GET /api/tenants/liquidity` | 🟢 |
| Tenant: cancel (only SUBMITTED/UNDER_REVIEW) | `DELETE /api/tenants/liquidity/:requestId` | 🟢 |
| Landlord: list org requests | `GET /api/landlord/liquidity?status=` | 🟢 |
| Landlord: review (UNDER_REVIEW/APPROVED/DENIED) | `PATCH /api/landlord/liquidity/:requestId/review` | 🟢 approving starts a 30-day ROFR clock |
| Landlord: add deduction | `POST /api/landlord/liquidity/:requestId/deductions` | 🟢 |
| Landlord: record ROFR decision (WAIVED/EXERCISED) | `PATCH /api/landlord/liquidity/:requestId/rofr` | 🟢 |
| Landlord: update transfer status | `PATCH /api/landlord/liquidity/:requestId/transfer` | 🟢 COMPLETED finalizes + writes ledger entries |

Response includes `vestedTokenPaymentRight` (requested − deductions, floored at 0), `statusHistory`, `rofrResponseDeadline`.

## Import Pipeline (NEW — Sprint C, Q8: validate → normalize → map → audit → persist)

An existing `csv-ingestion` module (upload → S3 → auto-detect column mapping → schema-driven validation → audit) already covered most of this — the only missing piece was **persist**, now added.

| Component | Endpoint | Status |
|---|---|---|
| Upload CSV, create ingestion job | `POST /api/csv/upload` (multipart, field `file`, `ingestionType`) | ✅ pre-existing |
| List / get ingestion jobs | `GET /api/csv`, `GET /api/csv/:ingestionId` | ✅ pre-existing |
| Preview headers + auto-detected mapping | `GET /api/csv/:ingestionId/preview` | ✅ pre-existing |
| Save confirmed column mapping | `PATCH /api/csv/:ingestionId/mapping` | ✅ pre-existing |
| Run validation | `POST /api/csv/:ingestionId/process` | ✅ pre-existing |
| **Persist stage (NEW):** create real tenant invites/tenancies from validated rows | `POST /api/csv/:ingestionId/persist` (TENANT type only, requires status COMPLETE) | 🟢 reuses `inviteTenant` (same as the manual Invite Tenant dialog); per-row CREATED/SKIPPED/ERROR results |
| **Import sources (NEW):** available vs. coming-soon connectors for the activation flow | `GET /api/csv/sources` | 🟢 CSV/Excel/Manual available; AppFolio/Yardi/Buildium/RealPage/Entrata/MRI reserved as COMING_SOON |

TENANT CSV template (proposed, open decision #4): `email, firstName, lastName, propertyRef, unitRef, monthlyRent, moveInDate, leaseEndDate` (propertyRef+unitRef required only for the persist step, not for validation).

## Property Manager Chat (NEW — Sprint C)

| Component | Endpoint | Status |
|---|---|---|
| PM starts a chat with a tenant (property-scoped, requires MESSAGE_TENANT permission) | `POST /api/chat/threads/with/:userId` `{ propertyId }` | 🟢 |
| PM's tenant contact list (for "New Chat") | `GET /api/property-manager/tenant-contacts` | 🟢 |
| Landlord: view PM↔tenant threads in their org (read-only, not a participant) | `GET /api/landlord/chat/pm-threads` | 🟢 |
| Landlord: read messages in a PM↔tenant thread | `GET /api/landlord/chat/pm-threads/:threadId/messages` | 🟢 |

## Blocked / not built yet

Nothing. All 6 Abdul-owned Sprint B/C backend tickets are complete (Good Standing, Program-config, Vesting, PM role + passwordless activation, Liquidity, Import pipeline + PM chat).

Four small **numeric decisions** are still pending from Laurel (see TASKS.md "Open product decisions") — vesting accrual rate, Good Standing threshold tuning, liquidity ROFR window, CSV column template. All shipped with sensible configurable defaults in the meantime.

**FE follow-up:** Kunle needs a PM activation flow (`/pm-activate?token=...` page → verify → request code → enter code → land on PM view), mirroring whatever screens exist for the tenant invite acceptance flow.
