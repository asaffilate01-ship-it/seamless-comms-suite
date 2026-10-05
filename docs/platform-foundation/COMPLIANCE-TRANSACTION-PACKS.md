# Compliance, Aramco and transaction/transformation packs

## 1. Aramco readiness pack

This should be implemented as an Omniqora compliance pack, not a separate platform.

The pack should support:

- supplier onboarding readiness;
- document/register checklist;
- third-party classification;
- SACS-210 applicability mapping;
- control register;
- evidence requests and evidence ageing;
- screenshots/files/source references;
- gap findings and remediation actions;
- responsible owner and reviewer;
- assessment preparation;
- audit-firm handoff pack;
- certificate/report register;
- renewal/expiry reminders;
- contract/classification change review;
- immutable review history;
- management dashboard;
- exportable evidence index.

Formal certification remains outside Omniqora. Omniqora can prepare, evidence, track and govern the assessment but must not represent itself as an Aramco-authorised audit firm or issue a CCC.

## 2. General compliance pack engine

Aramco should use the same generic objects as other frameworks:

- Framework
- Edition/version
- Requirement/control
- Applicability decision
- Evidence requirement
- Evidence item/version
- Test/procedure
- Finding
- Risk
- Remediation action
- Exception
- Reviewer decision
- Assessment
- Certificate/attestation metadata
- Expiry/renewal

This engine can later host reviewed NCA, SAMA, ISO, SOC 2, customer security questionnaires and vertical policy packs.

## 3. QITT-style transaction and transformation capability

Business360 already provides much of the domain foundation. The target product family is:

### Discover / Due Diligence
- current-state inventory;
- data-room/evidence ingestion;
- technical feasibility;
- gap/risk register;
- cost baseline;
- dependency mapping;
- management Q&A;
- Day-1 feasibility;
- 100-day roadmap.

### Transaction
- acquisition;
- merger;
- integration;
- carve-out;
- separation;
- NewCo;
- TSA catalogue and exit;
- Day-0 / Day-1 / hypercare;
- stranded/shared cost tracking.

### Integration Management Office
- workstreams;
- RAID;
- decisions;
- milestones;
- critical dependencies;
- cutover plan;
- acceptance gates;
- change;
- owner/RACI;
- board/SteerCo reporting.

### Technical domains
- cloud/infrastructure/data centre;
- identity/endpoint/workplace;
- security/audit/compliance;
- enterprise systems/processes;
- software/integration/API/middleware;
- BI/AI/data/governance.

### Benefits and value
- synergy hypothesis;
- baseline;
- benefit owner;
- technical deliverable -> business outcome -> financial impact;
- finance review;
- actuals/reconciliation;
- evidence pack;
- variance;
- benefits ledger;
- BAU handover.

## 4. Shared services used

These capabilities must reuse:

- Omniqora tenant/workspace identity;
- Enterprise AI governance;
- evidence/RAG/GraphRAG;
- agents and approvals;
- workflow engine;
- document service;
- audit trail;
- CRM for stakeholders/companies;
- Connect for authorised communications;
- Analytics for portfolio/board reporting.

They should not create duplicate identity, CRM, workflow or evidence databases unless a deployment boundary requires physical isolation.
