# Portfolio wiring audit and next phases — 16 October 2026

**Decision:** Omniqora is the shared SaaS/AI Factory. Each SaaS remains its own landlord and system of record. Customer organisations are operator-provisioned tenants with isolated users, roles, branches, domains, branding, plan limits, add-ons and server-side connector credentials. No unrestricted self-service activation.

This audit separates six states: absent, mapped, implemented, staged, live and blocked. A repository, migration or passing source test is not proof of deployment.

## Current position

| Product | Source | Landlord/tenant | Omniqora | AI intelligence | External providers | Production |
|---|---|---|---|---|---|---|
| Omniqora Factory | Implemented | Implemented | Implemented | Implemented | Blocked | Blocked |
| AutoHashi | Implemented | Implemented | Implemented | Implemented | Blocked | Blocked |
| Zivvo UK | Implemented | Mapped | Mapped | Mapped | Blocked | Blocked |
| Zivvo Germany | Implemented | Mapped | Mapped | Mapped | Blocked | Blocked |
| SparesGrid | Absent | Absent | Mapped contract only | Mapped contract only | Absent | Absent |
| MotResq | Implemented | Mapped | Mapped | Mapped | Blocked | Blocked |
| DishBee | Implemented | Implemented | Implemented | Implemented | Blocked | Blocked |
| Haccora | Implemented | Implemented | Implemented | Mapped | Blocked | Blocked |
| Care Academy | Mapping blocked | Mapped target | Mapped target | Mapped target | Absent | Absent |
| LessonAhead | Mapped | Implemented | Implemented | Mapped | Blocked | Blocked |
| Merqano | Implemented | Implemented | Implemented | Mapped | Blocked | Blocked |

The machine-readable evidence is `src/modules/control-plane/portfolio-wiring-evidence.json`. Validate it with `node scripts/factory-wiring-audit.mjs` and `node --test verification/control-plane/portfolio-wiring-audit.test.mjs`.

## What is genuinely working in source

- Omniqora Factory registry, landlord/product/tenant hierarchy, entitlements, connector contracts, agent governance and tests are merged on main.
- AutoHashi has auction-sheet intelligence, evidence scoring, bid controls and a clean product-side v4 PR for corrections, hammer ranges and saved watches.
- Haccora has tenant/site-scoped compliance and traceability work, but its latest phases are a stacked draft chain.
- MotResq has tested booking capacity, refund and workshop-routing improvements on an open draft PR.
- LessonAhead has a Factory registration and focused regression suite.
- Merqano provisioning has an idempotent, RLS-aware receiver contract.

## Not wired or not proven live

- Omniqora AutoHashi v4 PR #61 conflicts with current main. AutoHashi UI PR #9 is clean, but the pair is not a releasable end-to-end unit until reconciled and tested together.
- SparesGrid has no canonical repository. It is a product contract and roadmap only.
- Zivvo UK and Germany are old draft PRs. Their live market, finance, provenance and cross-border provider acceptance is not evidenced.
- DishBee to Haccora is one-sided: Haccora PR #62 explicitly lacks the verified DishBee outbound order publisher.
- No audited evidence proves active production tenants, production migrations, payment settlement, WhatsApp acceptance, live provider credentials, monitoring or operational sign-off for the products in this review.
- Care Academy needs an authoritative product-to-repository decision; similar care repositories are not enough.

## AI and Omniqora boundary

Product data stays in the product. A tenant-scoped, signed and idempotent event or request reaches Omniqora. Omniqora checks product, tenant, role, entitlement, consent, region and evidence freshness; then it runs deterministic analysis or governed AI. Results return as structured evidence with confidence, provenance and policy flags. Financial bids, compliance decisions, customer messages and other high-impact actions remain human-approved.

AutoHashi follows this model for auction extraction, corrections, comparable history, landed-cost inputs, prediction ranges and saved-watch ranking. AI may recommend; it must not create funds, reserve a lot, authorise a bid or conceal missing provider evidence.

## Germany to France boundary

The supported workflow is transparent cross-border due diligence: German source record, repair evidence from Poland/Lithuania when applicable, lawful roadworthiness/registration evidence, French import/registration requirements and expert review where required. The platform must never market this as bypassing French controls.

## Build order

1. Reconcile Omniqora AutoHashi v4 with current main and run the full bid/intelligence/auction test set.
2. Establish SparesGrid as its own repository and landlord; build dismantler tenant isolation, inventory, fitment, quote/order and channel contracts.
3. Activate one controlled automotive tenant through the Factory with negative cross-tenant tests.
4. Complete signed adapters: DishBee outbound to Haccora, Zivvo bridges and MotResq bridge.
5. Promote integrations individually through catalogued → sandbox verified → production verified → live, based on recorded evidence.

## Release gates

No tenant goes live until migrations, forced-RLS/negative tenancy tests, server-side secret storage, entitlement enforcement, signed replay-protected webhooks, audit logs, backup/restore, monitoring, provider smoke tests, payments where relevant, privacy/compliance review and operational acceptance are complete.
