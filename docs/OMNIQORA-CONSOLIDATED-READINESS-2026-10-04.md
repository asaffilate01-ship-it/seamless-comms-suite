# Omniqora consolidated readiness audit — 4 October 2026

This document is the pre-live source of truth for the Omniqora platform after reconciling the previous ~40 days of platform/SaaS Factory discussions, the current Lovable-synced `main`, and the surviving feature branches.

## Status meanings

- **MAIN** — merged into the current GitHub main branch.
- **BUILT** — source/migrations/routes or service implementation exist in the consolidation branch.
- **WIRED** — the capability has current control-plane/server/UI integration rather than catalogue-only labels.
- **CI VERIFIED** — exercised by the repository integration workflow (build, typecheck, migration/RLS checks and relevant tests).
- **PROVIDER/LIVE PENDING** — source is ready but external provider credentials, hosted service, production migration or customer traffic have not been independently proved.
- **SEPARATE PRODUCT MIGRATION** — a vertical product retains its authoritative product data/runtime and consumes Omniqora through the Factory/connectors.

## Platform readiness matrix

| Capability family | Built | Wired | CI verified | Production/live status |
| --- | --- | --- | --- | --- |
| SaaS Factory / landlord / tenant / product / service / entitlements | Yes | Yes | Yes | Production migration not yet proved by the manual Supabase production workflow |
| Branding, domains, regions/locales, white-label and product links | Yes | Yes | Yes | Domain/provider verification remains environment-specific |
| Identity, RBAC/RLS, MFA/passkeys/WhatsApp OTP/portal controls | Yes | Yes | Yes | Live IdP/OTP/passkey provider flows require production smoke testing |
| CRM & Customer 360 | Yes | Yes | Yes | Live vertical data sync remains per-product |
| Sales Engagement | Yes | Yes | Yes | Email/SMS/voice/e-sign provider activation remains environment-specific |
| Growth/RFM/LTV/churn, campaigns, journeys, experiments/referrals/attribution | Yes | Yes | Yes | Delivery/ad-platform credentials and production event volume not yet proved |
| Omniqora Contact / AI contact centre | Yes | Yes | Yes | Carrier/SIP/Twilio/Asterisk/provider activation not yet proved |
| Connect / WhatsApp / SMS / email / voice / push identities | Yes | Yes | Yes | Provider credentials and webhook delivery must be production-tested |
| Geo / routes / ETA / tracking / geofencing | Yes | Yes | Yes | Google Routes/geocoding live key and quota not yet proved |
| Dispatch / Fleet / Universal Agent / POD | Yes | Yes | Yes | Product-specific fleet cutovers remain shadow/parity migrations |
| Marketplace / Syndriva / vendors / listings / requests / matching / auctions | Yes | Yes | Yes | Payment/provider settlement activation remains environment-specific |
| Commerce / EPOS core / inventory / bookings / payments / loyalty | Yes | Yes | Yes | Physical EPOS/payment/KDS integrations remain product/provider-specific |
| Connected Operations / event projection / pricing approvals / signage | Yes | Yes | Yes | Real device/display/provider activation not yet proved |
| Franchise / managed-investor / route-time territory engine | Yes | Yes | Yes | Google routing/demographic production keys/data import required |
| Platform utilities: automation, documents, forms, support, search, notifications | Yes | Yes | Yes | Email/push/storage providers require production verification |
| Billing/metering/subscriptions/add-ons/credits | Yes | Yes | Yes | Payment processor/webhook reconciliation not yet live-proved |
| Mobile Core / device/offline/push/location primitives | Yes | Yes | Yes | App-store/push/mobile-client release remains product-specific |
| Telecom orchestration | Yes | Yes | Yes | Telecom provider contracts/credentials not yet live-proved |
| Analytics / metrics / BI semantic datasets / dashboards / exports / reporting | Yes | Yes | Yes | External BI destinations/warehouse runtime remain optional/provider work |
| Decision Intelligence / reviewed lessons / champion-challenger | Yes | Yes | Yes | Deliberately does not self-authorise high-impact actions |
| Agent Library / governed AI jobs / action approvals | Yes | Yes | Yes | Model-provider credentials/hosted workers must be activated |
| RAG / GraphRAG / reviewed graph extraction / Neo4j option | Yes | Yes | Yes | RRCI Python service deployment and live model/vector store must be proved |
| Business360 audit / discovery / transformation / M&A / carve-out / TSA / Day-1 | Yes | Yes | Yes | Planning/control records do not execute external cutovers themselves |
| Practice / Accounting AI / tax / payroll / company-secretarial | Yes | Yes | Yes | HMRC/Companies House/bank/e-file/accounting connectors require live activation |
| Compliance / RegulaOS / regulatory monitoring | Yes | Yes | Yes | External certification is never implied by platform readiness |
| Haccora one-product UK/DE country-pack model | Yes | Yes | Yes | Haccora app/function URLs, secrets and external product smoke tests required |
| Childcare/Kindelo shared engine | Yes | Yes | Yes | Existing Kindelo products should cut over by shadow sync/parity, not big bang |
| Automotive shared engine | Yes | Yes | Yes | Vehicle/auction/parts providers remain external connectors |
| Education Factory / Student-Cohort-Course-Institution 360 | Yes | Yes | Yes | UniPathway/source-app indexing, attendance/assessment and product connector rollout remains separate |
| Voxentri Creative Studio | Yes | Yes | Yes | AI media generation/storage providers remain externally activated services |
| Migration Factory / evidence/shadow/cutover gates | Yes | Yes | Yes | Each vertical still requires its own evidence and authority switch |

## Consolidation decisions

1. The current Lovable-synced `main` is the base; recent Lovable homepage/public changes are preserved.
2. The canonical non-Dishbee core from PR #41 is consolidated first.
3. Unique Connected Operations/Marketplace/EPOS/webhook capability from PR #40 is consolidated without overwriting the newer core.
4. Unique Franchise/Territory/managed-investor capability from PR #38 is consolidated using the newer `ownership/medium` growth-channel taxonomy.
5. Haccora-specific provisioning, connector credential and governed-intelligence bridge from PR #44 is consolidated without replacing the newer security migrations.
6. Voxentri Creative Studio is restored natively because it was the remaining shared-engine requirement still stranded in the old platform-engine donor branch.
7. Dishbee production/runtime branches remain separate by design.
8. Nafsi, LessonAhead and other verticals are product migrations on top of Omniqora, not platform modules that must be copied into the core.

## What is not yet proven live

GitHub source verification is not production activation.

At this audit point the following remain external/live gates:

- The repository contains a guarded **Supabase production migration** workflow for project `mqbmbzsadypjzirbfhja`, but no run of that production workflow has been observed yet.
- The current public Lovable application is sourced from `main`; the consolidation branch is not public until merged/synced and Lovable is explicitly published.
- Transformation/Business360 and RRCI/GraphRAG Python services pass source tests but GitHub/Lovable sync does not itself deploy those Python services.
- Provider secrets and production health are not inferred from `.env.example`: model providers, Meta/WhatsApp, telephony/SIP/Twilio, Google routing/geocoding, payments, email/push, HMRC/Companies House, banking/accounting, e-sign and vertical providers must be verified in the target environment.
- No vertical should switch production authority merely because its Omniqora connector exists. Use shadow sync, reconciliation/parity and an explicit cutover gate.

## Lovable / production release gate

**Do not press Lovable Publish solely because GitHub CI is green.**

The release sequence is:

1. Merge the fully green consolidation PR into `main`.
2. Require the new `main` commit to pass the full `Verify Omniqora integration` workflow.
3. Run the Supabase production workflow in **dry-run** mode and review every pending migration.
4. Apply the production migrations only with the explicit `MIGRATE-PRODUCTION` confirmation.
5. Verify required server-only secrets/URLs and deploy/upgrade Transformation and RRCI services.
6. In Lovable, allow GitHub `main` to sync; use preview to smoke-test public pages, auth and authenticated workspaces.
7. Test a controlled pilot tenant end-to-end: tenant/entitlement isolation, SaaS Factory, CRM, AI approval boundaries, connector health, event/webhook delivery, search/documents, analytics and one provider-backed flow.
8. Only then press **Publish** for `omniqora.itechlounge.co.uk`.
9. After publication, rerun the live smoke suite and monitor errors/webhooks/audit logs before onboarding or cutting over vertical products.
10. Migrate each vertical separately through shadow → parity/reconciliation → approval → authority switch.

## Current release recommendation

The platform source should be considered **pre-live / release-candidate**, not production-complete, until the combined consolidation CI, merged-main CI, production migration dry-run/apply, hosted Python services and live smoke tests all pass.
