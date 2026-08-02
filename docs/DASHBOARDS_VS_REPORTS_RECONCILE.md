# Dashboards vs Reports Reconciliation

Use this doc to ensure dashboard metrics align with report content and exports.

## Current State

### Dashboards

| Endpoint | Data Source | Metrics |
|----------|-------------|---------|
| `GET /api/dashboard/tenant` | Mock | Placeholder |
| `GET /api/dashboard/landlord` | Real aggregates (BE-200) | `portfolio` (properties, units, occupied, occupancyRate), `creditsSummary` (totalIssued, outstanding), `alerts` |

### Reports (Knowledge Base / Future)

| Report Type | Source | Content |
|-------------|--------|---------|
| Token issuance reports | `knowledge/12_website_content/landlords.md` | Token issuance for landlords |
| Compliance reports | `knowledge/05_landlord_value/landlord_dashboard_features.md` | Export compliance reports |
| Community dashboards | `knowledge/12_website_content/home.md` | Program compliance data |
| Landlord dashboard | `knowledge/05_landlord_value/landlord_dashboard_features.md` | Digital dashboards for compliance |

## Reconciliation Checklist

- [ ] **Portfolio metrics** — Dashboard `portfolio` (properties, units, occupied, occupancyRate) matches what reports describe (property counts, occupancy)
- [ ] **Credits** — Dashboard `creditsSummary` (totalIssued, outstanding) aligns with token issuance reports
- [ ] **Compliance** — When Program module exists, add compliance metrics to landlord dashboard; reconcile with compliance reports
- [ ] **Alerts** — Dashboard alerts should align with missing reports / compliance gaps when Program module is added

## Future Work

- Tenant dashboard: Replace mock with real aggregates (balance, tenancy, credits)
- Compliance/pledges: Add to dashboard when Program module is integrated
- Export: Reports export API should return same metrics as dashboard display
