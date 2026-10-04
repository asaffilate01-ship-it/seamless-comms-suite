# Business360 audit preparation and business-scoped plans

The shared Omniqora and standalone Business360 workspace now starts on **Audit
preparation** after selecting a project and business. Its six preparation checks
cover departments, people, stakeholders, mapped processes, a completed-period
financial baseline containing revenue/COGS/operating costs, and verified answers
across all 12 discovery domains.

These are starting-record checks, not a completeness certificate. A single
record in a register does not prove the entire business has been captured.
Financial amounts are management inputs; zero values are valid, absent values
are not. A future period cannot fulfil the baseline check. Discovery remains
incomplete if any answer is disputed, unknown, reported or missing. Source IDs
are included for review. No AI provider is invoked by the checklist.

## Business scope

The selected business now controls the collections summary, proposed actions
and plan export. Workspace-wide aggregates remain available in the backend
report for callers that explicitly request the entire workspace. Each proposed
discovery, issue and implementation action carries its company ID.

**Export selected business plan** requests a fresh `business.report` with the
selected company and displayed as-of date. The server checks current project
membership and applies company scope before returning JSON. The report includes
the current data version; it is current recorded data evaluated at the supplied
date, not a historical database snapshot. An invalid selector is rejected rather
than silently broadening scope. Private salary records are excluded from this
report. Company selection does not create a new company-level access boundary;
project membership remains the authorisation boundary.

Collections remain review candidates only: held/disputed invoices are excluded
and balances must be verified on the report date. No customer is contacted and
this release does not connect Recovrable or execute an improvement action.

## Deployment

Deploy the Transformation service and shared host/standalone interface. No new
database migration is required. With an older service, business-specific totals
and preparation status show as unavailable rather than falling back to
workspace-wide figures. The checklist does not certify M&A, carve-out, legal or
production readiness.
