# Portfolio cross-selling release — 15 September 2026

The catalogue contains 76 product scopes: 65 confirmed and 11 awaiting scope review. Confirmed scopes have recommendation rules; review entries stay disabled. Configuration coverage is distinct from deployment.

This release records 51 implementation targets: 21 Sites published, 13 app repositories merged, and 17 app repositories held at failed release gates. The Cross-selling workspace exposes a dated release snapshot, search/filter controls, evidence links and an export. Configured products without a verified rollout target are listed separately.

## Customer behaviour

Three optional suggestions appear in an appropriate business workflow, with an expandable list of up to twelve categories. The engine uses product, country, audience and placement. It suppresses the source product, equivalent supplier alias, explicitly owned services and dismissed offers. Recommendations stay off for unknown/review products, invalid markets, login, checkout and urgent support.

Veyumo, Omniqora Intelligence, XpertJobs, TaxNuvia accountant referrals, suppliers/Zarvane, Insure360 enquiries and other complementary services are available where the rules permit them. UK insurance, UK accountant referrals and Haccora UK are country-gated. Driving instructors, childcare/care providers, events, trades, fleets, motor dealers and professional firms receive different insurance enquiry topics. Provider review is required; introductions do not bind policies.

Consumer placements require explicit product relationships. Business placements preserve current role boundaries. Care recipients, children, students, job applicants, private sellers, messages, legal cases, financial records and customer segments do not supply targeting data.

Public links carry only product and placement labels. Pilot services and insurance offers create a local brief that is explicitly not sent. No automatic purchase, provider activation, cross-product identity link or paid entitlement is created.

Haccora UK separately persists explicit, consented owner requests in tenant-scoped support cases. Its Veyumo bridge never asserts a paid entitlement without a verified billing-backed provider assertion.

## Haccora UK hosted launch

[UK source PR 37](https://github.com/asaffilate01-ship-it/haccora-connect/pull/37) is merged at 62b0d09a59e0b2a644326c45d8f26122ab7bc5a4. All eight final GitHub checks passed, covering web, native, browser, fresh database and security gates.

Hosted launch remains incomplete:

- The production scheduler has no SUPABASE_URL repository variable or CRON_SECRET secret.
- Supabase project dbjbhemmtdkzulsxfvmi needs the reviewed production migrations and Edge Functions deployed.
- Real account role boundaries, request persistence and Stripe payment lifecycle acceptance must run against the hosted release.
- Lovable and Supabase are not connected in this session. GitHub source access cannot establish hosted acceptance.
- Live Stripe secrets stay in Lovable only: STRIPE_LIVE_API_KEY, LOVABLE_API_KEY and PAYMENTS_LIVE_WEBHOOK_SECRET. Do not copy them into Supabase.
- The webhook remains https://app.haccora.co.uk/api/public/payments/webhook. iTechLounge identity and approval-only two-month trial behaviour are preserved.

## Integration API

GET /api/integrations/opportunities?country=GB&audience=business&placement=dashboard

Use an existing product-scoped integration bearer credential on the server. Source identity comes from the credential. Paused workspaces and disabled products are rejected. Credentials must not be exposed in browsers or URLs. The owner-private Site audience is preserved; this release does not create a public integration gateway.

## Validation

45 shared behaviour and authorization tests passed after the catalogue and supplier-alias additions. Shared components typecheck with strict optional properties and unchecked index access enabled. All 47 changed TypeScript modules in the final repository batch parsed successfully. The central Site build validates the console and opportunities endpoint.

Haccora UK separately passed 268 unit tests, native validation, production dependency audits and all eight final GitHub checks. Sites were built and packaged locally except TaxNuvia Accounts, whose dependency download timed out; its hosted build and publication succeeded.

A source merge is not proof that a Lovable-hosted app has deployed. Sites publication does not imply paid provider activation.

## Recorded release targets

| Product / target | State | Audience | Placement | Evidence |
| --- | --- | --- | --- | --- |
| Omniqora Intelligence console | Site published | Private | Portfolio rules and rollout visibility | [Site](https://omniqora-ai.amersaleem.chatgpt.site) |
| Veyumo | Site published | Private | Business page | [Site](https://veyumo.amersaleem.chatgpt.site) |
| Insure360 | Site published | Private | Owner/admin overview, team and connections | [Site](https://insure360.amersaleem.chatgpt.site) |
| LessonAhead UK | Site published | Private | Instructor dashboard and school fleet | [Site](https://lessonahead-uk.amersaleem.chatgpt.site) |
| Premisora | Site published | Private | Business and provider asset workflows | [Site](https://premisora-uk.amersaleem.chatgpt.site) |
| Cirqiva | Site published | Private | Provider and operator workspaces | [Site](https://wastora-uk.amersaleem.chatgpt.site) |
| RegulaOS | Site published | Private | Business document workflow using profile country | [Site](https://regulaos.amersaleem.chatgpt.site) |
| Gabley Retrofit | Site published | Private | Professional asset workspace | [Site](https://gabley-retrofit.amersaleem.chatgpt.site) |
| MarktPass | Site published | Public | Overview, reports and team; Germany | [Site](https://marktpass-dashboard.amersaleem.chatgpt.site) |
| Affivon | Site published | Private | Administrator dashboard | [Site](https://affiliate-commerce-os.amersaleem.chatgpt.site) |
| Sponsor Intelligence UK | Site published | Private | Job seeker resources; explicit consumer relationships only | [Site](https://sponsor-intelligence-uk.amersaleem.chatgpt.site) |
| TaxNuvia Accounts UK | Site published | Private | Business overview | [Site](https://taxnuvia-accounts.amersaleem.chatgpt.site) |
| Tendryva | Site published | Private | Overview, team and evidence; chosen business market | [Site](https://tenderos.amersaleem.chatgpt.site) |
| Konnevia CRM | Site published | Private | Dashboard, CRM, team and integrations; chosen market | [Site](https://konnevia-crm.amersaleem.chatgpt.site) |
| CommerceOps | Site published | Private | Overview, suppliers and integrations; chosen market | [Site](https://commerceops.amersaleem.chatgpt.site) |
| Recovra | Site published | Private | Overview, team and integrations; chosen market | [Site](https://recovra-recovery.amersaleem.chatgpt.site) |
| Travel Agency OS | Site published | Private | Overview and suppliers; chosen market | [Site](https://travel-agency-os.amersaleem.chatgpt.site) |
| EmpfangIQ | Site published | Private | Overview, team and integrations; Germany | [Site](https://empfangiq-dashboard.amersaleem.chatgpt.site) |
| LoungeTech Training Cloud | Site published | Public | Provider administrator overview, people and evidence; Germany | [Site](https://loungetech-training-cloud.amersaleem.chatgpt.site) |
| LoungeTech Gründungsportal | Site published | Public | Founder/administrator overview and partners; Germany | [Site](https://loungetech-gruendung.amersaleem.chatgpt.site) |
| Auvane One professional desk | Site published | Private | Professional workspace; chosen business market | [Site](https://private-lifestyle-concierge.amersaleem.chatgpt.site) |
| Haccora Germany | Source merged; hosted pending | Existing app audience | Owner dashboard; Germany | [PR](https://github.com/asaffilate01-ship-it/haccora/pull/17) |
| Craftvaro | Source merged; hosted pending | Existing app audience | Trader dashboard and business performance | [PR](https://github.com/asaffilate01-ship-it/jobflow-tradehub/pull/8) |
| XpertJobs | Source merged; hosted pending | Existing app audience | Employer overview, team and subscription | [PR](https://github.com/asaffilate01-ship-it/xpertjobs/pull/3) |
| Omniqora communications | Source merged; hosted pending | Existing app audience | Owner/admin dashboard; Germany | [PR](https://github.com/asaffilate01-ship-it/seamless-comms-suite/pull/2) |
| EventPlanr UK | Release blocked | Existing app audience | Vendor dashboard | [PR](https://github.com/asaffilate01-ship-it/eventplanr2/pull/2) |
| KinderStars UK | Release blocked | Existing app audience | Childminder dashboard | [PR](https://github.com/asaffilate01-ship-it/kinderstars-childcare-saas/pull/7) |
| Zoryn Pay | Release blocked | Existing app audience | Business and merchant overview | [PR](https://github.com/asaffilate01-ship-it/zoryn-nexus/pull/2) |
| Zoryn Rewards | Release blocked | Existing app audience | Merchant dashboard | [PR](https://github.com/asaffilate01-ship-it/zoryn-rewards-hub/pull/2) |
| TaxNuvia accountant finder | Release blocked | Existing app audience | Dashboard link to existing service catalogue | [PR](https://github.com/asaffilate01-ship-it/your-accountant-finder/pull/18) |
| Haccora UK | Source merged; hosted pending | Existing app audience | Owner add-ons catalogue, bundles and ten contextual workflows | [PR](https://github.com/asaffilate01-ship-it/haccora-connect/pull/37) |
| LeadLens | Source merged; hosted pending | Existing app audience | Business sales dashboard; chosen market | [PR](https://github.com/asaffilate01-ship-it/leadlens-discovery/pull/3) |
| ThreeOneThree | Source merged; hosted pending | Existing app audience | Business dashboard; chosen market | [PR](https://github.com/asaffilate01-ship-it/threeonethree/pull/1) |
| MotoResQ | Source merged; hosted pending | Existing app audience | Vendor documents, subscription and earnings; existing UK/UAE/DE region | [PR](https://github.com/asaffilate01-ship-it/all-road-aid/pull/3) |
| Zarvane | Source merged; hosted pending | Existing app audience | Approved trade orders; supplier self-offer suppressed | [PR](https://github.com/asaffilate01-ship-it/zarvane/pull/1) |
| Gabley | Release blocked | Existing app audience | Landlord/agent dashboard; UK | [PR](https://github.com/asaffilate01-ship-it/remix-of-property-nexus/pull/3) |
| EventPlanr Germany | Release blocked | Existing app audience | Vendor dashboard; Germany | [PR](https://github.com/asaffilate01-ship-it/eventplanrger/pull/12) |
| KinderStars Germany | Release blocked | Existing app audience | Childminder dashboard; Germany | [PR](https://github.com/asaffilate01-ship-it/kinderstars/pull/16) |
| Orvilo | Release blocked | Existing app audience | Business dashboard; hidden during publishing | [PR](https://github.com/asaffilate01-ship-it/webtemplates/pull/3) |
| Dokuvera | Source merged; hosted pending | Existing app audience | Admin/manager/surveyor document dashboard; existing UK/DE region | [PR](https://github.com/asaffilate01-ship-it/remix-of-remix-of-surveycam-app/pull/3) |
| FleetSora | Release blocked | Existing app audience | Fleet administrator and branch administrator only; UAE scope. | [PR](https://github.com/asaffilate01-ship-it/ddelivery3pl/pull/1) |
| TaxCenda | Source merged; hosted pending | Existing app audience | Provider admin overview only; US scope. | [PR](https://github.com/asaffilate01-ship-it/usataxlounge/pull/1) |
| AmityOS | Source merged; hosted pending | Existing app audience | Active organisation owner/admin/manager finance view; no care recipient context. | [PR](https://github.com/asaffilate01-ship-it/care-connect/pull/1) |
| Skillfinch | Release blocked | Existing app audience | Owner/admin employer operations tab only, market chosen explicitly. | [PR](https://github.com/asaffilate01-ship-it/care-quest-learn/pull/11) |
| IQ Practice Cloud | Release blocked | Existing app audience | Staff with practice settings permission; accountant referral suppressed. | [PR](https://github.com/asaffilate01-ship-it/practicecraft-hub/pull/2) |
| Ilmvero | Release blocked | Existing app audience | School/campus/platform administrators only; Pakistan scope. | [PR](https://github.com/asaffilate01-ship-it/schooldash/pull/1) |
| Zivvo UK and enabled markets | Release blocked | Existing app audience | Dealer staff tab only; existing country configuration. | [PR](https://github.com/asaffilate01-ship-it/autosouq/pull/1) |
| Zivvo Germany | Release blocked | Existing app audience | Authorised dealer staff management tab; Germany copy and market. | [PR](https://github.com/asaffilate01-ship-it/zivvo/pull/20) |
| OnýnGo | Release blocked | Existing app audience | Verified vendor owner revenue tools; explicit business market, no customer segments shared. | [PR](https://github.com/asaffilate01-ship-it/onyn/pull/2) |
| Bidlumo | Release blocked | Existing app audience | Approved business sellers only on overview; no personal sellers or auction/checkout panels. | [PR](https://github.com/asaffilate01-ship-it/bidora1/pull/2) |
| Veris Law | Source merged; hosted pending | Existing app audience | Practice administrator dashboard only; explicit business market. No case details inform recommendations. | [PR](https://github.com/asaffilate01-ship-it/law-remix/pull/2) |

## Open repository gates

- **EventPlanr UK** — Existing secret-scan permission/configuration and tracked environment-file checks failed. Preserve runtime configuration while resolving the release gates. [Change](https://github.com/asaffilate01-ship-it/eventplanr2/pull/2).
- **KinderStars UK** — GitHub checks failed before a runner or steps were assigned; job logs were unavailable. Restore working CI and rerun before merge. [Change](https://github.com/asaffilate01-ship-it/kinderstars-childcare-saas/pull/7).
- **Zoryn Pay** — GitHub checks failed before a runner or steps were assigned; job logs were unavailable. Restore working CI and rerun before merge. [Change](https://github.com/asaffilate01-ship-it/zoryn-nexus/pull/2).
- **Zoryn Rewards** — GitHub checks failed before a runner or steps were assigned; job logs were unavailable. Restore working CI and rerun before merge. [Change](https://github.com/asaffilate01-ship-it/zoryn-rewards-hub/pull/2).
- **TaxNuvia accountant finder** — GitHub checks failed before a runner or steps were assigned; job logs were unavailable. Restore working CI and rerun before merge. [Change](https://github.com/asaffilate01-ship-it/your-accountant-finder/pull/18).
- **Gabley** — Existing npm lock mismatch, missing lock validator and check script, and disabled dependency graph block the repository gates. [Change](https://github.com/asaffilate01-ship-it/remix-of-property-nexus/pull/3).
- **EventPlanr Germany** — GitHub checks failed before a runner or steps were assigned; job logs were unavailable. Restore working CI and rerun before merge. [Change](https://github.com/asaffilate01-ship-it/eventplanrger/pull/12).
- **KinderStars Germany** — GitHub checks failed before a runner or steps were assigned; job logs were unavailable. Restore working CI and rerun before merge. [Change](https://github.com/asaffilate01-ship-it/kinderstars/pull/16).
- **Orvilo** — GitHub checks failed before a runner or steps were assigned; job logs were unavailable. Restore working CI and rerun before merge. [Change](https://github.com/asaffilate01-ship-it/webtemplates/pull/3).
- **FleetSora** — GitHub checks failed before a runner or steps were assigned; job logs were unavailable. Restore working CI and rerun before merge. [Change](https://github.com/asaffilate01-ship-it/ddelivery3pl/pull/1).
- **Skillfinch** — GitHub checks failed before a runner or steps were assigned; job logs were unavailable. Restore working CI and rerun before merge. [Change](https://github.com/asaffilate01-ship-it/care-quest-learn/pull/11).
- **IQ Practice Cloud** — Typecheck, tests and build passed; existing production dependency advisories and a duplicate data_subject_requests policy block CI. [Change](https://github.com/asaffilate01-ship-it/practicecraft-hub/pull/2).
- **Ilmvero** — GitHub checks failed before a runner or steps were assigned; job logs were unavailable. Restore working CI and rerun before merge. [Change](https://github.com/asaffilate01-ship-it/schooldash/pull/1).
- **Zivvo UK and enabled markets** — GitHub checks failed before a runner or steps were assigned; job logs were unavailable. Restore working CI and rerun before merge. [Change](https://github.com/asaffilate01-ship-it/autosouq/pull/1).
- **Zivvo Germany** — GitHub checks failed before a runner or steps were assigned; job logs were unavailable. Restore working CI and rerun before merge. [Change](https://github.com/asaffilate01-ship-it/zivvo/pull/20).
- **OnýnGo** — GitHub checks failed before a runner or steps were assigned; job logs were unavailable. Restore working CI and rerun before merge. [Change](https://github.com/asaffilate01-ship-it/onyn/pull/2).
- **Bidlumo** — GitHub checks failed before a runner or steps were assigned; job logs were unavailable. Restore working CI and rerun before merge. [Change](https://github.com/asaffilate01-ship-it/bidora1/pull/2).

Do not remove or bypass release gates. Jobs without runners or steps need working GitHub Actions restored; no billing or policy cause is inferred from unavailable logs. Gabley additionally needs its lock/scripts and dependency graph repaired. IQ Practice Cloud passed typecheck, tests and build but has production dependency advisories and a duplicate data_subject_requests policy during migration replay.

Machine-readable evidence is maintained in lib/portfolio-rollout.ts. This is a dated snapshot, not automatic monitoring or conversion analytics.
