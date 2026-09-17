# Omniqora and SaaS file index — 2026-09-15

Download `Omniqora-Consolidated-AI-Pack.zip` for the central sources and `SaaS-Project-Packs.zip` for **79 separately labelled product/target packs**. They cover 29 verified non-Omniqora repositories, 20 Sites with reusable adapters, and 29 additional catalogue products whose repository mapping is unverified. An additional ZaksTrader pack contains 59 verified current source reference files and a reuse review. The two Omniqora targets are consolidated in the central pack. Market variants remain separate.

This is a source/development handover, not a claim that all apps now have a live AI integration. Read each `START-HERE.md` before adding files. Repository packs contain exact PR updates; Site/unmapped packs contain reusable adapters and integration briefs. The Dishbee kit also includes the recovered hospitality showcase Site source. Product packs deliberately do not contain complete copies of every existing application.

## Financial-adviser and learning extension

The updated central pack now includes `development/adviser-learning/`: new local adviser review utilities, the decision/outcome journal, independently reviewed lessons, candidate-comparison checks and the current ZaksTrader source review. Seventeen new local tests and a fictional demo passed. This is a local implementation with further host/UI/provider work, not an already integrated financial-advice or trading service.

`Omniqora-Adviser-and-Learning-Extension.zip` contains just this addition. `ZaksTrader-Project-Pack.zip` contains the source/reuse reference for the trading repository. All earlier product packs in the SaaS master now include a shared-learning adoption pointer; the updated convenience ZIPs do too. The existing 263 PR file snapshots remain unchanged; the 59 ZaksTrader source files are an additional inspection snapshot, not a new PR export.

## Central files

| Source | Where it belongs | Status |
| --- | --- | --- |
| New RRCI handover | Omniqora `services/rrci`, `src/modules/rrci`, paired tenant helper and draft migration after reconciliation | Unfinished development update; not pushed or deployed |
| Wider agentic/generative AI, My day, BI and reception pilot | Port selected modules into Omniqora with its original merge guide | Source available; different pilot framework/storage; main integration unfinished |
| Shared Knowledge Core v0.2 | Included within RRCI; separate original retained as reference | Text RAG, optional embeddings/generation and Neo4j source included |
| Ecosystem Core v3 | One central persistent Python runtime plus selected adapters per app | Source available; actual billing/provider activation remains separate |
| Lawquo connection handover | Omniqora `docs/lawquo-connection-handover.md` | Contract to implement; Lawquo runtime stays in `law-remix` |
| Omniqora PR2 | Existing `seamless-comms-suite` paths | Already merged portfolio-services update, five files |
| Older OmniQora full suite | Isolated reference folder | Preserved, not a replacement for newer source |
| New server client | Each SaaS backend through its verified auth and queue | Six local contract tests passed; no live connection claimed |

## Product packs

| Project | Pack folder | Exact target / known Site | Contents/status |
| --- | --- | --- | --- |
| Haccora Germany | `01-repository-updates/haccora` | asaffilate01-ship-it/haccora | PR 17: merged (7 files) |
| Craftvaro | `01-repository-updates/jobflow-tradehub` | asaffilate01-ship-it/jobflow-tradehub | PR 8: merged (6 files) |
| XpertJobs | `01-repository-updates/xpertjobs` | asaffilate01-ship-it/xpertjobs | PR 3: merged (5 files) |
| EventPlanr UK | `01-repository-updates/eventplanr2` | asaffilate01-ship-it/eventplanr2 | PR 2: unmerged (5 files) |
| KinderStars UK | `01-repository-updates/kinderstars-childcare-saas` | asaffilate01-ship-it/kinderstars-childcare-saas | PR 7: unmerged (6 files) |
| Zoryn Pay | `01-repository-updates/zoryn-nexus` | asaffilate01-ship-it/zoryn-nexus | PR 2: unmerged (5 files) |
| Zoryn Rewards | `01-repository-updates/zoryn-rewards-hub` | asaffilate01-ship-it/zoryn-rewards-hub | PR 2: unmerged (6 files) |
| TaxNuvia accountant finder | `01-repository-updates/your-accountant-finder` | asaffilate01-ship-it/your-accountant-finder | PR 18: unmerged (2 files) |
| Haccora UK | `01-repository-updates/haccora-connect` | asaffilate01-ship-it/haccora-connect | PR 37: merged (70 files) |
| LeadLens | `01-repository-updates/leadlens-discovery` | asaffilate01-ship-it/leadlens-discovery | PR 3: merged (6 files) |
| ThreeOneThree | `01-repository-updates/threeonethree` | asaffilate01-ship-it/threeonethree | PR 1: merged (6 files) |
| MotoResQ | `01-repository-updates/all-road-aid` | asaffilate01-ship-it/all-road-aid | PR 3: merged (5 files) |
| Zarvane | `01-repository-updates/zarvane` | asaffilate01-ship-it/zarvane | PR 1: merged (5 files) |
| Gabley | `01-repository-updates/remix-of-property-nexus` | asaffilate01-ship-it/remix-of-property-nexus | PR 3: unmerged (5 files) |
| EventPlanr Germany | `01-repository-updates/eventplanrger` | asaffilate01-ship-it/eventplanrger | PR 12: unmerged (5 files) |
| KinderStars Germany | `01-repository-updates/kinderstars` | asaffilate01-ship-it/kinderstars | PR 16: unmerged (5 files) |
| Orvilo | `01-repository-updates/webtemplates` | asaffilate01-ship-it/webtemplates | PR 3: unmerged (6 files) |
| Dokuvera | `01-repository-updates/remix-of-remix-of-surveycam-app` | asaffilate01-ship-it/remix-of-remix-of-surveycam-app | PR 3: merged (5 files) |
| FleetSora | `01-repository-updates/ddelivery3pl` | asaffilate01-ship-it/ddelivery3pl | PR 1: unmerged (5 files) |
| TaxCenda | `01-repository-updates/usataxlounge` | asaffilate01-ship-it/usataxlounge | PR 1: merged (5 files) |
| AmityOS | `01-repository-updates/care-connect` | asaffilate01-ship-it/care-connect | PR 1: merged (5 files) |
| Skillfinch | `01-repository-updates/care-quest-learn` | asaffilate01-ship-it/care-quest-learn | PR 11: unmerged (6 files) |
| IQ Practice Cloud | `01-repository-updates/practicecraft-hub` | asaffilate01-ship-it/practicecraft-hub | PR 2: unmerged (5 files) |
| Ilmvero | `01-repository-updates/schooldash` | asaffilate01-ship-it/schooldash | PR 1: unmerged (5 files) |
| Zivvo UK and enabled markets | `01-repository-updates/autosouq` | asaffilate01-ship-it/autosouq | PR 1: unmerged (5 files) |
| Zivvo Germany | `01-repository-updates/zivvo` | asaffilate01-ship-it/zivvo | PR 20: unmerged (5 files) |
| OnýnGo | `01-repository-updates/onyn` | asaffilate01-ship-it/onyn | PR 2: unmerged (6 files) |
| Bidlumo | `01-repository-updates/bidora1` | asaffilate01-ship-it/bidora1 | PR 2: unmerged (5 files) |
| Lawquo / Veris Law | `01-repository-updates/law-remix` | asaffilate01-ship-it/law-remix | PR 2: merged (6 files); PR 1: draft / unmerged (40 files) |
| Veyumo | `02-site-adapters/veyumo` | https://veyumo.amersaleem.chatgpt.site | Reusable adapters; Site publication recorded in earlier rollout, not revalidated here |
| Insure360 | `02-site-adapters/insure360` | https://insure360.amersaleem.chatgpt.site | Reusable adapters; Site publication recorded in earlier rollout, not revalidated here |
| LessonAhead UK | `02-site-adapters/lessonahead` | https://lessonahead-uk.amersaleem.chatgpt.site | Reusable adapters; Site publication recorded in earlier rollout, not revalidated here |
| Premisora | `02-site-adapters/premisora` | https://premisora-uk.amersaleem.chatgpt.site | Reusable adapters; Site publication recorded in earlier rollout, not revalidated here |
| Cirqiva | `02-site-adapters/cirqiva` | https://wastora-uk.amersaleem.chatgpt.site | Reusable adapters; Site publication recorded in earlier rollout, not revalidated here |
| RegulaOS | `02-site-adapters/regulos2` | https://regulaos.amersaleem.chatgpt.site | Reusable adapters; Site publication recorded in earlier rollout, not revalidated here |
| Gabley Retrofit | `02-site-adapters/gabley-retrofit` | https://gabley-retrofit.amersaleem.chatgpt.site | Reusable adapters; Site publication recorded in earlier rollout, not revalidated here |
| MarktPass | `02-site-adapters/marktpass` | https://marktpass-dashboard.amersaleem.chatgpt.site | Reusable adapters; Site publication recorded in earlier rollout, not revalidated here |
| Affivon | `02-site-adapters/affivon` | https://affiliate-commerce-os.amersaleem.chatgpt.site | Reusable adapters; Site publication recorded in earlier rollout, not revalidated here |
| Sponsor Intelligence UK | `02-site-adapters/sponsor-intelligence-uk` | https://sponsor-intelligence-uk.amersaleem.chatgpt.site | Reusable adapters; Site publication recorded in earlier rollout, not revalidated here |
| TaxNuvia Accounts UK | `02-site-adapters/taxnuvia-accounts` | https://taxnuvia-accounts.amersaleem.chatgpt.site | Reusable adapters; Site publication recorded in earlier rollout, not revalidated here |
| Tendryva | `02-site-adapters/tenderos` | https://tenderos.amersaleem.chatgpt.site | Reusable adapters; Site publication recorded in earlier rollout, not revalidated here |
| Konnevia CRM | `02-site-adapters/konnevia-crm` | https://konnevia-crm.amersaleem.chatgpt.site | Reusable adapters; Site publication recorded in earlier rollout, not revalidated here |
| CommerceOps | `02-site-adapters/commerceops` | https://commerceops.amersaleem.chatgpt.site | Reusable adapters; Site publication recorded in earlier rollout, not revalidated here |
| Recovra | `02-site-adapters/recovra-recovery` | https://recovra-recovery.amersaleem.chatgpt.site | Reusable adapters; Site publication recorded in earlier rollout, not revalidated here |
| Travel Agency OS | `02-site-adapters/travel-agency-os` | https://travel-agency-os.amersaleem.chatgpt.site | Reusable adapters; Site publication recorded in earlier rollout, not revalidated here |
| EmpfangIQ | `02-site-adapters/empfangiq-dashboard` | https://empfangiq-dashboard.amersaleem.chatgpt.site | Reusable adapters; Site publication recorded in earlier rollout, not revalidated here |
| LoungeTech Training Cloud | `02-site-adapters/loungetech-training-cloud` | https://loungetech-training-cloud.amersaleem.chatgpt.site | Reusable adapters; Site publication recorded in earlier rollout, not revalidated here |
| LoungeTech Gründungsportal | `02-site-adapters/loungetech-gruendung` | https://loungetech-gruendung.amersaleem.chatgpt.site | Reusable adapters; Site publication recorded in earlier rollout, not revalidated here |
| Auvane One professional desk | `02-site-adapters/private-lifestyle-concierge` | https://private-lifestyle-concierge.amersaleem.chatgpt.site | Reusable adapters; Site publication recorded in earlier rollout, not revalidated here |
| AhlNikkah | `03-unmapped-products/ahlnikkah` | Unverified | Reusable adapters; repository mapping unverified |
| Merqora | `03-unmapped-products/merqora` | Unverified | Reusable adapters; repository mapping unverified |
| DOMUREVA | `03-unmapped-products/domureva` | Unverified | Reusable adapters; repository mapping unverified |
| Immoviq | `03-unmapped-products/immoviq` | Unverified | Reusable adapters; repository mapping unverified |
| HMO Flow | `03-unmapped-products/hmo-flow` | Unverified | Reusable adapters; repository mapping unverified |
| Merqano | `03-unmapped-products/merqano` | Unverified | Reusable adapters; repository mapping unverified |
| Dishbee | `03-unmapped-products/dishbee` | Unverified | Reusable adapters; repository mapping unverified |
| Schonova | `03-unmapped-products/schonova` | Unverified | Reusable adapters; repository mapping unverified |
| UniPathways | `03-unmapped-products/unipathways` | Unverified | Reusable adapters; repository mapping unverified |
| TrainDirekt | `03-unmapped-products/traindirekt` | Unverified | Reusable adapters; repository mapping unverified |
| Kalethon Play | `03-unmapped-products/kalethon-play` | Unverified | Reusable adapters; repository mapping unverified |
| NearCura | `03-unmapped-products/nearcura` | Unverified | Reusable adapters; repository mapping unverified |
| Pipkin | `03-unmapped-products/pipkin` | Unverified | Reusable adapters; repository mapping unverified |
| BeraterMarkt | `03-unmapped-products/beratermarkt` | Unverified | Reusable adapters; repository mapping unverified |
| BeistandPlus | `03-unmapped-products/beistandplus` | Unverified | Reusable adapters; repository mapping unverified |
| Voxentri | `03-unmapped-products/voxentri` | Unverified | Reusable adapters; repository mapping unverified |
| Fanzeno | `03-unmapped-products/fanzeno` | Unverified | Reusable adapters; repository mapping unverified |
| LoungeConnect | `03-unmapped-products/loungeconnect` | Unverified | Reusable adapters; repository mapping unverified |
| Rettio | `03-unmapped-products/rettio` | Unverified | Reusable adapters; repository mapping unverified |
| Kiezio | `03-unmapped-products/kiezio` | Unverified | Reusable adapters; repository mapping unverified |
| Syndryvia / user spelling Syndrivya — identity to confirm | `03-unmapped-products/syndrivya-syndryvia-unconfirmed` | Unverified | Reusable adapters; repository mapping unverified |
| STEMCoach | `03-unmapped-products/stemcoach` | Unverified | Reusable adapters; repository mapping unverified |
| Criclume | `03-unmapped-products/criclume` | Unverified | Reusable adapters; repository mapping unverified |
| FormationGenie | `03-unmapped-products/formationgenie` | Unverified | Reusable adapters; repository mapping unverified |
| Recovarable | `03-unmapped-products/recovarable` | Unverified | Reusable adapters; repository mapping unverified |
| DepotMesh | `03-unmapped-products/depotmesh` | Unverified | Reusable adapters; repository mapping unverified |
| Gradlume | `03-unmapped-products/gradlume` | Unverified | Reusable adapters; repository mapping unverified |
| DearNext | `03-unmapped-products/dearnext` | Unverified | Reusable adapters; repository mapping unverified |
| AI Construction Planning | `03-unmapped-products/construction-planning` | Unverified | Reusable adapters; repository mapping unverified |
| ZaksTrader | `04-reviewed-source/zakstrader` | asaffilate01-ship-it/remix-of-market-mind-intelligence-34 | 59 current reference files; shared bridge pending |

## Provenance and validation

263 changed-file snapshots across 31 GitHub PRs were recovered and matched against Git blob hashes. The central Omniqora PR accounts for five files; product PRs account for 258. Original source archives and SHA-256 manifests are included. Tests rerun: knowledge core 29 passed/31 skipped; RRCI 43 passed/31 skipped; new server client 6 passed. Skipped cases require live Neo4j; production/app integration tests were not run.

The two duplicate attachments were matched byte-for-byte. The newly supplied RRCI attachment is included as the later, unfinished development branch. It changes existing tenant onboarding/policy as well as adding RRCI, so its migration and helper need joint isolated testing. Historical v0.2 Neo4j evidence does not validate new governance against Neo4j.

The three supplied shared-chat URLs could not be opened through available access, so their contents are not asserted as reviewed. Their exact links are retained in SOURCE-REGISTER.json. Other accessible context, original files, GitHub changes and the supplied RRCI handover were used. If those links contain additional files beyond these originals, their attachments/text are still needed to include those exact bytes.

No code was pushed, PR merged, production database changed or Site published during this consolidation. Existing merged/unmerged statuses are recorded independently for each PR. Source merge status does not establish deployment status.
