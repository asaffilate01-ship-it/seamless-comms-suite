# Omniqora unified platform: capability verification and delivery sequence

**Audit date:** 1 November 2026. Source scope: `main` of `seamless-comms-suite` and the named product/Business360 capability documents. **No customer production connection, migration reconciliation, live WhatsApp delivery or provider billing is certified by this file.**

## Principles

Omniqora is the shared control plane, not an ownership claim over Dishbee, Kindelo, UniPathway, Haccora, MoneyBridge or other separate source applications. A landlord provisions products and service entitlements; tenant, brand, location, department and region access is separately authorised. Source applications remain authoritative for orders, staff, finances and regulatory decisions. All AI actions must be evidence-linked, priced, reversible where possible, bounded by permissions and subject to human approval when consequential.

Use the current `PRODUCT.md` and `DESIGN.md` as UI authority. Taste Skill for audit-first art direction; Impeccable `critique/audit/harden/polish` for scoped accessibility and quality; Awesome DESIGN.md for patterns, not copying a brand. Retain mobile/desktop focus, reduced-motion, RTL and explicit empty/disconnected states.

## Capability review: source presence versus operational closure

| Domain | Existing source foundation | Unverified or next capability | Acceptance gate |
| --- | --- | --- | --- |
| SaaS Factory / tenancy | `app.tenant-factory`, entitlements, blueprints, provider onboarding, control-plane policies | Live tenancy/region/entitlement parity against every vertical; no blanket migration replay | Cross-tenant negative tests and reconciled staging schema |
| WhatsApp / communications | Cloud API channel UI, webhook, communications events; Twilio SMS/voice intake | Meta embedded signup, number ownership, WABA/phone account updates, provider webhooks, retries, suppression, delivery status reconciliation | Official account activation; signed webhook and two-tenant replay tests |
| AI receptionist (Aila comparison) | Reception sessions, order intake, handoff, agent catalogue | Calibrated 24/7 voice handling, availability-backed bookings, real-time changes/cancellations, multi-team call routing, summary and qualified-lead destination | Real provider calls, human takeover, consent and booked-slot reconciliation |
| CRM / Customer360 | People, company, leads, opportunity, activity and source-aware service scope | Field/record-level grants, email/calendar sync, dedupe review, tenant pipelines, lead scoring with model review | Scope tests, sample source sync, human-reviewed duplicate decisions |
| Dispatch / Jungleworks-class | Geo, driver, agent, dispatch, tracking and bounded routing tests | Capacity/shift-based auto allocation, GPS and ETA provider parity, proof-of-delivery, 3PL brokerage, driver offline mobile UX | Provider shadow comparison and route KPI/exception testing |
| Commerce / EPOS | EPOS core migration, marketplace and ordering contracts | Certified hardware/KDS/payment terminals, refunds, offline sync, multi-location stock and VAT reconciliation | Real devices and settlement/order parity |
| Business360 full business audit | Source-linked guided discovery, departmental assessment, financial baselines and opportunities | Accounting/ERP/HRIS connectors, payroll/FTE/capacity utilisation, benchmark provenance, approvals, evidence coverage | Independent baseline review and data minimisation |
| Efficiency / operating model | Business360 evidence and workstream planning | Process-mining imports, capacity/time studies, KPI baselines, value leakage, resourcing scenarios, benefits after implementation | Versioned methodology; finance-approved realised savings only |
| M&A / carve-outs | Transaction scopes, diligence, TSA, 13 Day-1 domains and versioned plan drafts | Buyer/seller data room permissions, separation-cost attribution, standalone viability, Day-1 owners, legal/tax advisers and actual systems migration tools | Diligence signoff; segregated redacted export, rehearsal and rollback |
| Enterprise communications | Contact/Connect, conversations, sales engagement and journeys | Consented omni-channel identity resolution, business-hours/routing policies, call QA scoring, complaint SLAs and outbound templates | Consent, suppression, recordings retention, live call and message outcomes |
| GenAI / Agentic AI | Agent Factory, model-cost routing, scoped capabilities, RAG/GraphRAG optional providers | Evaluations by use case; queue receipts; prompt-injection tests; tool allowlists; budgets and cost dashboards | Dry-run + human review + independent provider/region acceptance |
| MCP / automation | Connector catalogue, Ruflo bridge, worker constraints | Credential isolation, supply-chain review, version-pinned manifests, human gates, retry/dead-letter queue | Fail-closed tool authorization and tenant data boundary tests |
| UI / UX | Product/design context, accessible public navigation improvements | Authenticated inbox, onboarding, service health, pipeline and audit console visual QA | 360/390/768/1440 px, keyboard, zoom, RTL, real errors |

The names in the right-hand columns are **requirements/gaps, not delivered features**. Existing source modules are not proof of live availability.

## Ordered releases

1. **P0 — trust and operational truth:** harden WhatsApp callback verification for all numbers before writes, tenant-scope all delivery updates, add bounded parsing; label configured versus verified channels honestly. Review existing duplicate-message production rows before adding a future unique key and atomic ingest RPC. Do not mistake a pre-insert existence check for concurrency-proof idempotence.
2. **P1 — authoritative tenant service health:** per-tenant provider activation, credentials in server vault, channel test receipts, migrations ledger reconciliation, consent and licence/capability inventory; audit negative paths.
3. **P2 — Aila-level reception and communications:** verified calendar availability, controlled booking/cancel/reschedule, inbound qualification, CRM capture, call transfer and after-hours automation; Twilio/Meta official paths only, explicit consent; no speculative live-booking status.
4. **P3 — dispatch + EPOS:** delivery assignment and capacity tests, route optimisers with supplier failure fallback, courier exceptions; payment/stock reconciliation and KDS/provider acceptance in Dishbee without moving its order authority.
5. **P4 — Business360 audit + M&A:** workplace/HR/departmental cost models, evidence-linked gaps, independent reviewer attestation, carve-out TSA Day-1 plans, transaction-safe redaction and audit trails; any actual cutover via separately approved service connectors.
6. **P5 — intelligence and productised governance:** secure cross-product semantic warehouse, event projections, model evaluation/guardrails, human-approved AI workflows, chargeback, white-label UX and release telemetry.

## Reference projects (evaluate patterns and licences; do not bulk-install code)

- Design: https://github.com/Leonxlnx/taste-skill ; https://github.com/pbakaus/impeccable ; https://github.com/VoltAgent/awesome-design-md
- CRM and automation: https://github.com/twentyhq/twenty ; https://github.com/activepieces/activepieces ; https://github.com/chatwoot/chatwoot
- Agent workflows: https://github.com/langchain-ai/langgraph ; https://github.com/temporalio/temporal ; https://github.com/triggerdotdev/trigger.dev
- Routing and logistics benchmarks: https://jungleworks.com/tookan/
- Aila feature reference: https://focusgroup.co.uk/solutions/customer-experience/aila-ai-receptionist/

Each repository or project remains subject to security/licence review, active-maintainer assessment, interoperability and an integration-specific acceptance test. This audit does **not** assert an examination of thousands of repositories.

## Release controls

Code only goes to a reviewed feature branch. Run focused tests, TypeScript, build, repository security checks and CI; verify schema ledger against the actual target before any production migration. Observe WhatsApp/telephony and any ERP/payroll/finance side effects in a non-customer sandbox. No Lovable editor work, credits or force pushes.
