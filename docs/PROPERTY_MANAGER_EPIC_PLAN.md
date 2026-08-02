# Property Manager Epic — Pre-Implementation Plan

> Requested by Laurel before Ticket 1 implementation begins: proposed data model, permission matrix, endpoint plan, dependencies, and timing.
> Scope split confirmed 2026-07-20: **Abdul owns all backend** (data model, permissions, every endpoint including dashboard data endpoints). **Kunle owns all UI** (dashboard screens, chat interface, onboarding forms) — same split as every prior ticket.
> Author: Abdul. Last updated: 2026-07-20.

---

## 0. What already exists (don't rebuild)

A "thin" Property Manager role shipped in Sprint B (see TASKS.md). This epic extends it — it does not start from zero.

| Already built | File |
|---|---|
| `PROPERTY_MANAGER` role recognized by auth/RBAC | `user.model.ts`, `auth-user.ts`, `authMiddleware.ts` |
| Property-scoped assignment (one row per PM+property, unique-active index) | `propertyManagerAssignment.model.ts` |
| 7 permission flags (`ADD_TENANT`, `INVITE_TENANT`, `UPLOAD_TENANT_INFO`, `UPLOAD_NOTES`, `SUBMIT_MAINTENANCE_UPDATES`, `MESSAGE_TENANT`, `UPLOAD_DOCUMENTS`) | same file |
| Landlord-invite flow: assign → passwordless OTP activation email → PM sets no password, logs in via JWT | `propertyManagerInvite.model.ts` / `.service.ts` |
| Existing-account handling: re-inviting an already-active PM email reuses the user, doesn't duplicate | `propertyManager.service.ts:findOrCreatePMUser` |
| PM↔tenant chat (permission-gated on `MESSAGE_TENANT`), landlord read-only view of PM/tenant threads | `chat.service.ts`, `landlordChat.routes.ts` |
| PM notes visibility (`LANDLORD_AND_PM` vs `LANDLORD_ONLY`) | notes module |
| `GET /api/property-manager/my-properties` — PM's own assignment list across landlords (multi-landlord already works for *listing*, just not context-switching) | `propertyManager.routes.ts` |

**What this epic adds:** granular permission matrix (Laurel's ~50 flags vs current 7), independent RPA-only onboarding (no landlord required), TEPA read-only monitoring, explicit sensitive-field blocking, 3-party group chat, multi-landlord context switching, and the dashboard data-aggregation endpoints.

---

## 1. Proposed data model

### 1.1 New entities

**`PropertyManagerOrganization`** (new collection `property_manager_organizations`)
Only needed for the independent-RPA path (Path A) — a PM's own company identity, separate from any landlord org.
```
_id
name                    // property-management company name
primaryContactUserId    // the PM who created it
address, website?
createdAt, updatedAt
```
For Path B (landlord-invited), the PM operates *inside* the landlord's `Organization` via the existing `Membership` row (`roleInOrg: MEMBER`) — no new org needed there.

**`PropertyManagerInvitation`** — already exists as `PropertyManagerInviteModel`, but its `status` enum today is only `SENT | ACCEPTED | CANCELLED`. Extending to match Laurel's spec:
```
status: 'DRAFT' | 'SENT' | 'OPENED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'REVOKED'
```
(`DRAFT`/`OPENED` are new; the rest map to existing states plus a new `DECLINED` action.)

**`PropertyManagerAssignment`** — extend the existing model rather than replace it:
```diff
  permissions: PMPermission[]           // expanding from 7 → ~50 flags (§2)
+ unitIds?: ObjectId[]                  // optional — null/empty = whole property; populated = unit-level restriction
+ source: 'LANDLORD_INVITE' | 'INDEPENDENT_RPA'   // which onboarding path created this row
  status: 'ACTIVE' | 'REVOKED'
+            | 'PENDING' | 'SUSPENDED'  // PENDING = invite sent, not yet accepted; SUSPENDED = temporarily paused without full revoke
+ revocationReason?: string
```
Unit-level restriction is additive and optional, per spec ("initial UI can primarily assign whole properties, but backend should allow this later") — no migration needed for existing rows (`unitIds` absent = unrestricted, current behavior unchanged).

**`RPAAdministrationAuthority`** — not a new collection. Modeled as permission flags within the existing assignment's `permissions` array (§2). A landlord who never signed up simply has no `PropertyManagerAssignment` row at all — the independent PM's authority over their own created property comes from being `assignedBy: self` with `source: INDEPENDENT_RPA`.

**`TEPAMonitoringAuthority`** — same pattern: a boolean-equivalent permission flag (`TEPA_VIEW`), not a separate collection.

**`ChatVisibilitySettings`** — extend the existing `Organization.settings`:
```diff
  settings: {
    allowDirectTenantMessaging: boolean,
+   allowPMDirectTenantChat: boolean,      // default true — landlord can revoke PM's ability to message tenants directly
+   allowPMGroupChat: boolean,             // default true — landlord can revoke PM's ability to create 3-party threads
+   landlordCanViewPMThreads: boolean,     // default true — already effectively true today, made explicit/toggleable
  }
```

### 1.2 Reused, unchanged

Property, Unit, Tenancy, User, Membership, Organization, Conversation/Message, TokenLedgerEntry, RewardCatalog/Redemption, MaintenanceTicket, GoodStanding, AuditEvent — all canonical records, zero duplication. PM dashboard reads the exact same rows the Landlord dashboard reads, filtered by assignment scope.

### 1.3 Future landlord "claim" of an independent PM's property

Per spec, MVP doesn't need automated ownership verification. Proposed MVP mechanism: an admin-assisted claim — landlord signs up, contacts KeyPath, admin manually links the existing `Property.orgId` to the new landlord org and back-fills a `PropertyManagerAssignment` row (`source: INDEPENDENT_RPA` stays, a `landlordUserId` gets attached). No new schema needed for MVP; flagging as an **open product decision** in §8.

---

## 2. Permission matrix

Expanding `PMPermission` from 7 flags to the categories Laurel listed. All are opt-in per assignment row (landlord grants per property); independent RPA accounts get the RPA + roster + maintenance + messaging groups by default (never TEPA, since there's no landlord to grant it).

| Category | Flag | Default for landlord-invited PM |
|---|---|---|
| **Property/Roster** | `VIEW_PROPERTY`, `VIEW_UNITS`, `VIEW_TENANTS`, `VIEW_LEASE_TERMS` | ✅ granted |
| | `EDIT_PROPERTY`, `EDIT_UNITS`, `ADD_TENANT`, `INVITE_TENANT`, `REMOVE_TENANT`, `EDIT_LEASE_TERMS`, `VIEW_LEASE_DOCUMENTS`, `UPLOAD_LEASE_DOCUMENTS`, `VIEW_RENT_DATA`, `VIEW_ARREARS` | ❌ requires explicit grant |
| **RPA** | `RPA_VIEW` | ✅ |
| | `RPA_CONFIGURE`, `RPA_ENROLL_TENANT`, `RPA_CREATE_REWARD`, `RPA_CREATE_CAMPAIGN`, `RPA_CREATE_CHALLENGE`, `RPA_APPROVE_REDEMPTION`, `RPA_ADJUST_BALANCE`, `RPA_EXPORT` | ❌ requires explicit grant |
| **TEPA** (all read-only, no write path exists at all) | `TEPA_VIEW` | ❌ requires explicit grant |
| **Maintenance** | `MAINTENANCE_VIEW`, `MAINTENANCE_UPDATE_STATUS`, `MAINTENANCE_ASSIGN`, `MAINTENANCE_ADD_NOTES`, `MAINTENANCE_UPLOAD_ATTACHMENTS`, `MAINTENANCE_AWARD_REWARD` | ✅ granted |
| **Messaging** | `MESSAGE_TENANT`, `MESSAGE_LANDLORD` | ✅ granted |
| | `CREATE_GROUP_CHAT`, `VIEW_PM_TENANT_THREADS_AS_LANDLORD` *(this one is a landlord-side flag, not PM-side)* | ✅ / N/A |
| **Reporting** | `VIEW_REPORTS`, `VIEW_ACTIVITY_LOG`, `VIEW_COMPLIANCE_STATUS` | ✅ granted |
| | `EXPORT_REPORTS` | ❌ requires explicit grant |

`UPLOAD_NOTES` and `UPLOAD_DOCUMENTS` (existing flags) map into Property/Roster and Maintenance groups respectively — kept as-is.

**Enforcement point:** every PM-facing controller calls a single `assertPMPermission(pmUserId, propertyId, flag)` helper (extends the existing `hasPMAccess`) that checks, in order: (1) role is `property_manager`, (2) an `ACTIVE` assignment exists for that property, (3) `unitIds` (if set) contains the requested unit, (4) the flag is in `permissions[]`. No frontend-only hiding — matches Laurel's §14 requirement.

---

## 3. Endpoint plan

### New
| Endpoint | Purpose |
|---|---|
| `POST /api/property-manager/independent/register` | Path A step 1–3: create PM user + `PropertyManagerOrganization` |
| `POST /api/property-manager/independent/properties` | Path A: PM creates a property under their own authority (`source: INDEPENDENT_RPA`) |
| `POST /api/property-manager/independent/confirm-authority` | Path A step 6: PM certifies authorization (stored on the assignment row for audit) |
| `GET /api/property-manager/dashboard/summary` | Aggregated summary cards (§ dashboard), scoped to active landlord context |
| `GET /api/property-manager/context/landlords` | List of distinct landlord orgs this PM has active assignments under |
| `POST /api/property-manager/context/select` *(or just a `?orgId=` query param — see §8 open decision)* | Set/return active landlord context |
| `POST /api/chat/group-threads` | Create 3-party PM+landlord+tenant conversation (uses existing `Conversation.type: 'group'`, already supported in schema) |
| `PATCH /api/landlord/property-managers/:assignmentId/permissions` | Update the granular permission set for one assignment |
| `PATCH /api/landlord/chat-settings` | Extend existing endpoint to include the 3 new PM chat toggles (§1.1) |
| `GET /api/landlord/property-managers/:assignmentId` — decline endpoint | `PATCH /api/pm-invites/:token/decline` |

### Reused as-is (RBAC-gated by new permission flags, no new routes)
- Property/Unit/Tenant/Lease read endpoints already used by landlord dashboard — add PM-scoped variants or extend existing controllers to accept `req.auth.role === 'property_manager'` and apply assignment-based filtering instead of org-based filtering.
- RPA reward/campaign endpoints — same pattern, gated by `RPA_*` flags.
- TEPA/vesting/token-ledger read endpoints — gated by `TEPA_VIEW`, reject any write attempt from a PM at the middleware level (belt-and-suspenders even though PM never gets write routes).
- Maintenance endpoints — gated by `MAINTENANCE_*` flags.
- Export endpoints (`/api/exports/:dataset`) — add `property_manager` to allowed roles, filtered to assigned properties only.

---

## 4. Frontend components reusable from Landlord dashboard (for Kunle)

- KPI summary cards, property/unit/tenant list tables, tenant detail page shell, maintenance ticket list/detail, notes panel, chat thread list + message view, report/export buttons, notification bell.
- **Not reusable as-is:** debt/investor/equity cards (excluded entirely), landlord-only settings screens, TEPA liquidity approval UI (PM gets a read-only variant instead).

## 5. Onboarding screens required (for Kunle)

- Path A: "Create Property Manager Account" → profile form → "RPA only / I was invited" choice → property/unit/tenant/lease entry or import → RPA config → review/activate.
- Path B: invite-accept screen (mirrors existing tenant/PM activation screens already built) showing inviting landlord, assigned properties, granted permissions before accept/decline.
- Landlord-side: "Add Property Manager" form with per-property permission checkboxes (multi-select property + permission matrix UI).

---

## 6. Estimated timing (backend only)

| Phase | Tickets | Estimate |
|---|---|---|
| Phase 1 — architecture, role/assignment extension, permission matrix, sensitive-field blocking | 1–5 | 3–4 days |
| Phase 2 — independent RPA onboarding, invite/accept extensions, data-connection guarantees | 6–9 | 3 days |
| Phase 3 — dashboard summary + list/detail endpoints, multi-landlord context | 10–12 | 2–3 days |
| Phase 4 — chat: group threads, visibility toggles | 13 | 1–2 days |
| Phase 5 — RPA administration endpoints (mostly reuse + gating) | per spec | 2 days |
| Phase 6 — TEPA read-only monitoring endpoints | per spec | 1 day |
| Phase 7 — end-to-end tests, audit coverage | testing | 2 days |
| **Total** | | **~14–17 working days** |

Assumes no scope changes mid-build. Each phase ships independently testable (matches Laurel's phased video-demo request).

---

## 7. Dependencies on Kunle

- None block backend start — Phase 1–2 (architecture, permissions, onboarding logic) can proceed entirely backend-only.
- Kunle is blocked *on me* for: permission-flag names/shape (frozen after this doc is approved) and dashboard summary endpoint response shape (delivered end of Phase 3) before he can wire the dashboard screens.
- Suggest Kunle start on static screens/layout (reusing landlord components) in parallel using mock data matching §3/§4, then swap to live endpoints as each phase ships — same pattern used for the rest of the platform.

---

## 8. Decisions — resolved by Laurel 2026-07-20

> Laurel approved the overall plan ("the overall approach is aligned... You can begin") with the following resolutions and adjustments. This section is now the source of truth — supersedes the "proposed" language in §1–§3 where it conflicts.

**Resolved (the 5 open questions originally listed here):**
1. Admin-assisted landlord claim process — **approved as-is** for MVP.
2. Stateless multi-landlord context (`GET /context/landlords` + `?orgId=`) — **approved**. Coordinate with Kunle so the frontend persists the last-selected landlord client-side where practical (no new backend session state needed — a client-stored preference is sufficient).
3. PM three-party group chat default — **OFF**, not on. `allowPMGroupChat` defaults `false`; landlord must explicitly enable it (now property/assignment-scoped, not org-wide — see adjustment 2 below).
4. Assignment `SUSPENDED` status — **manual-only** for MVP, confirmed.
5. Reports/exports for independent RPA PM accounts — **default enabled**, confirmed.

**New adjustments (change the design in §1–§3):**

1. **RPA is NOT default-on for landlord-invited PMs.** Correction to §2's permission matrix: `RPA_VIEW` moves from ✅-default to ❌-requires-explicit-grant for `LANDLORD_INVITE` assignments. Both viewing and management require the landlord to grant it per property. **Independent RPA accounts (`source: INDEPENDENT_RPA`) still get the full RPA permission group automatically** — unchanged, since there's no landlord to grant it.
2. **Chat visibility settings must be property/assignment-scoped, not only org-wide.** Correction to §1.1: `allowPMDirectTenantChat` and `allowPMGroupChat` move **off** `Organization.settings` and onto `PropertyManagerAssignment` itself (per-assignment fields, alongside the rest of the permission flags) — so a landlord can allow group chat on Property B but not Property A for the same PM. `landlordCanViewPMThreads` stays an org-level default (it's about the landlord's own visibility, not a PM capability grant); individual assignments can override it later if needed. **Endpoint impact:** the planned `PATCH /api/landlord/chat-settings` extension is dropped; these flags are instead set via `PATCH /api/landlord/property-managers/:assignmentId/permissions` (§3), alongside the rest of the permission flags.
3. **PM-to-landlord direct chat is explicitly in scope**, called out separately from PM-to-tenant and group chat (previously implicit via `MESSAGE_LANDLORD` but not its own workflow). Added to §3's endpoint plan: `POST /api/chat/pm-landlord-threads` — PM-initiated thread with the landlord tied to their assignment's org, gated by `MESSAGE_LANDLORD` (default-granted, per §2).
4. **Organization membership must never independently grant landlord-data access.** Architecture principle, not a new endpoint: the `Membership` row created for a landlord-invited PM (`roleInOrg: MEMBER`) exists only so the PM resolves into the right org context (e.g. the `context/landlords` listing) — it must **never** be treated as an authorization check on its own. Every data-access path continues to gate exclusively through `assertPMPermission` (§2) against an `ACTIVE` `PropertyManagerAssignment` row. Called out explicitly for Phase 1 review since it's a security invariant — any new endpoint in this epic that reads `Membership` for context must not use it as a substitute for the assignment check.

---

## 9. Acceptance criteria — unchanged from Laurel's spec §16, tracked per-ticket in TASKS.md as work lands.
