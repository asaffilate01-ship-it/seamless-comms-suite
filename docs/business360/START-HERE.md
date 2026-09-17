# Omniqora Business360 — combined development build

Version 0.3.0 • 16 September 2026

One business discovery and transformation engine, available through an Omniqora add-on and a standalone application. This extends the supplied Transformation and Product AI v0.2 package. It is an executable pilot build; it has not been merged into the live Omniqora repository or deployed.

## Start with the business

1. Sign in to an enabled workspace. An owner or administrator selects **Add a business**, enters its name, sector, accountable owner and currency. This creates an engagement/project and its initial company record.
2. Add departments and their purposes, then people, roles, reporting relationships and stakeholders. A person must refer to an existing department in that business. People/stakeholder records do not automatically receive login access.
3. Use the guided discovery questions to establish purpose, customers, revenue, processes, people, assets, technology, costs, collections, suppliers, compliance and goals. Record source references and distinguish reported, verified, disputed and unknown evidence.
4. Add the financial baseline, assets, systems, costs, issues, processes and improvement assumptions. The existing detailed registers remain available for company planning, technical delivery and product development.
5. Review the business report, missing evidence, financial metrics and proposed improvements. For acquisition, merger or carve-out work, define a transaction scope in **Company planning**, then generate preparation, Day-1 and 100-day plans and review their gaps.
6. Grant project roles separately under Access, review proposed actions, and track accepted work and evidenced benefits. Agents currently execute internal tasks/reports only.

## What this build adds

| Area | Implemented in v0.3 |
|---|---|
| Business-first onboarding | Business → departments → people and stakeholders → discovery → performance → improvement plan. |
| Business discovery | Twelve question domains, source references, evidence status, process and issue registers. |
| Financial fundamentals | Period-specific revenue/cost inputs; gross and operating profit/margins; DSO/DIO/DPO and cash conversion when sufficient inputs exist; CAC, lead conversion and missed-call rates. Decimal calculations; missing inputs remain unavailable. |
| Improvement planning | Proposed actions and dates, separate benefit types, recurring and implementation costs, overlap warnings and exportable report. Estimates are not booked or independently verified savings. |
| Collections | Overdue balance analysis; candidate selection excludes disputed, held, stale and zero balances. Recovrable is an integration boundary, not a connected service. |
| Identity and access | Existing Supabase identity for the add-on. Standalone password login, opaque server sessions, CSRF/origin checks, logout, revocation, rate limits and operator-managed users/entitlements. |
| Database RLS | PostgreSQL adapter and migration with forced RLS on all seven business transaction tables, tenant/project isolation, separate private pay records and restricted writes. |
| Shared product | Both interfaces use the same React workspace and Python engine. Standalone includes a prebuilt browser bundle. |

The supplied company's planning, M&A/carve-out scopes, TSAs, six technical workstreams, product intelligence, knowledge retrieval and controlled agents remain in this build. Optional model and graph providers require configuration. The separately discussed Enterprise Governance & Adoption extension is an adjacent module to reuse at integration time; its independent code was not supplied in this archive and is not claimed merged here.

## Run and review

- `standalone/README.md`: local evaluation, login provisioning and hosted configuration.
- `docs/INTEGRATION.md`: merge into Omniqora and deploy the shared service.
- `docs/SECURITY.md`: identity, RLS, personnel confidentiality and exact boundaries.
- `docs/CAPABILITY-STATUS.md`: implemented versus planned capabilities.
- `docs/COMPANY-PLANNING.md`: inherited company/M&A/carve-out workflow.
- `verification/RESULTS.md`: checks run, results and untested environments.
- `docs/PRODUCT-BRIEF.md`: fuller product and commercial design, including future scope. It is a specification, not an implementation checklist claiming everything is complete.

This build supports evaluation and a controlled pilot after deployment validation. Self-serve billing, SSO/MFA for standalone, email invitations/recovery, live business-system connectors, automated document parsing, Recovrable calls, fine-grained deal clean rooms and autonomous external execution are not implemented. Do not advertise them as working features.
