# Backend roadmap: TEPA & Jobs (Tickets 6 & 7)

Reference for **Ticket 7 (TEPA Participation Ledger)** and **Ticket 6 (Jobs & Workforce Metrics)** — to implement when prioritised.

---

## Ticket 7: Tenant Participation & Economic Accumulation (TEPA) Participation Ledger

**Type:** Backend / Ledger  
**EPIC:** 5 — Tenant Participation & Economic Accumulation (TEPA)

### Track per tenant (internal)

- Entry date
- Participation status
- Accumulation rate
- Annual accumulation value

### Expose to municipality (aggregated only)

- Eligible tenants
- Opted-in count
- Participation %
- YoY growth rate
- Avg accumulation range
- Median participation duration

### Implementation notes

- New models/collections for TEPA participation (e.g. `tepa_participation` or extend tenant/ledger).
- Aggregation endpoints or views for municipality (read-only, org/city-scoped).
- Consider linking to existing credit ledger and tenancy data.

---

## Ticket 6: Jobs & Workforce Metrics

**Type:** Backend / Analytics  
**EPIC:** 4 — Local Economic Impact

### Metrics

- Construction jobs created (estimated)
- Ongoing property jobs
- % local hires
- MWBE participation %

### Notes

- Allow manual overrides with audit trail.
- Support estimation formulas (e.g. jobs per unit, per $ spend).

### Implementation notes

- New analytics/aggregation module or extend dashboard.
- Audit all overrides via existing `writeAuditEvent`.
- Store formulas/config for estimations (e.g. in config or DB).
