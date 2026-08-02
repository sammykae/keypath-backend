# Compliance vs Pledges Reconciliation

Use this doc when the Program module (compliance/pledges) is added to ensure alignment.

## Definitions

| Term | Description |
|------|-------------|
| **Compliance** | Program compliance status: zoning, housing covenants, reporting completeness, program completion milestones. Status: ON_TRACK \| AT_RISK \| NON_COMPLIANT |
| **Pledges** | Promised vs achieved metrics per project (e.g. affordable units). Status: ON_TRACK \| AT_RISK \| EXCEEDED |

## When Program Module Exists

### Compliance

- **Model:** `ProgramComplianceRecordModel`
- **Fields:** zoningCompliance, housingCovenantsCompliance, reportingComplete, programCompletionMilestonesMet, status, nextAuditDate
- **Endpoints:** `POST/GET /api/program/compliance/status`

### Pledges

- **Model:** `ProgramPledgeRecordModel`
- **Fields:** projectId, pledgeType, promised, achieved, status
- **Endpoints:** `POST/GET /api/program/compliance/pledges`

### Reconciliation Rules

1. **Status mapping** — Compliance and pledge both use "On Track" / "At Risk" / "Off Track" (or "Exceeded" for pledges) in UI; ensure API enums match.
2. **getProgramOverview** — Aggregate `programCompliance` from compliance records; reconcile with `/compliance/status` response.
3. **getPledgeTracking** — Aggregate pledge status; reconcile with individual pledge records in `/compliance/pledges`.
4. **Dashboard display** — Landlord/community dashboards should show compliance overview and pledge summary; reconcile with these endpoints.

## Current Branch

Program module is not yet present. Use this doc as a spec when implementing Program module and integrating compliance/pledges into dashboards.
