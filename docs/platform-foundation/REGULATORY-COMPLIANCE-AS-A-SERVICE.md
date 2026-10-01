# Omniqora Compliance-as-a-Service — AI-first regulatory engine

Status: architecture and contracts on the isolated platform-engines branch. No live regulator integration, submission or production migration is activated by this file.

## Product direction

Omniqora Compliance should be a shared, AI-first regulatory application and ongoing-compliance platform.

It is not one app per regulator. It is one engine with versioned regulatory packs.

Initial packs can include:

- FCA authorisation / registration / ongoing compliance;
- CQC registration / location/service/registered-manager readiness / ongoing assurance;
- Ofsted registration / provider/setting readiness / inspection evidence;
- Aramco supplier cybersecurity / CCC readiness and evidence preparation;
- NCA / SAMA and other Saudi control packs;
- ISO-style management/control programmes;
- customer/buyer due-diligence questionnaires;
- other regulator, licence, accreditation or tender packs.

Each pack is reviewed, versioned, dated and tied to source references. A pack is not certification and does not replace qualified legal, compliance, clinical, safeguarding, cybersecurity or other professional review.

## AI at the heart

AI is present throughout the workflow, but it never becomes the authority for a consequential regulatory assertion.

### AI Regulatory Copilot

Understands the firm/provider, proposed activities, locations, services, people, customer/service-user groups and regulator pack. It guides the user through the correct evidence and workflow.

### AI Intake & Discovery

- conversational onboarding;
- extract structured facts from uploaded documents;
- identify missing firm/provider/location information;
- reconcile conflicting answers;
- propose the likely pack/workstream;
- create clarification questions;
- link facts to source evidence.

AI proposals remain drafts until the responsible user confirms them.

### AI Evidence Mapper

For every requirement/control/question:

1. retrieve only permitted evidence using RRCI/RAG/GraphRAG;
2. identify potentially relevant documents/records;
3. explain why they may be relevant;
4. flag stale, contradictory or missing evidence;
5. propose evidence gaps;
6. preserve citations and document versions.

Evidence presence does not mean compliance. Review remains separate.

### AI Application Drafter

Create evidence-grounded draft answers for application questions and supporting narratives.

Every draft should carry regulator/pack, question/requirement version, source references, known facts, assumptions, missing evidence, uncertainty, reviewer and approval status.

The AI must abstain where the evidence is insufficient rather than inventing an answer.

### AI Gap & Readiness Engine

AI can classify and explain gaps, while deterministic rules calculate readiness status.

Requirement -> applicability -> evidence expected -> evidence found -> freshness/version check -> AI evidence review -> deterministic status -> reviewer decision -> remediation action

AI can propose severity and remediation. Final status and sign-off remain policy/role controlled.

### AI Policy / Procedure Builder

Draft tailored policies, procedures, registers and control descriptions using the customer's actual business model and evidence. Templates should reference business/service scope, accountable roles, systems, locations, processes, control frequency, records/evidence, escalation and review period.

### AI Inspection / Interview Simulator

Prepare users for regulator or assessor engagement through mock interviews, likely follow-up questions, evidence challenges, scenario questions, location/service-specific inspection simulation, weakness explanation and remediation coaching. This is preparation, not prediction of a regulator's decision.

### AI Correspondence Assistant

Ingest authorised regulator/assessor correspondence, identify requests, extract deadlines, map requests to owners/evidence, draft responses, build RFI response packs and track submitted versions. Sending/submitting requires explicit human approval.

### AI Ongoing Compliance Monitor

After authorisation/registration/certification: monitor evidence expiry, control performance, missed reviews/tasks, operational events against obligations, policy/process drift, regulatory-change impacts, board/management briefings and recurring assessments.

External legal/regulatory updates require a verified source ingestion process. AI must not silently treat unverified web content as authoritative obligations.

## Shared deterministic core

The existing procurement/readiness primitives should be generalised rather than duplicated.

Canonical objects include regulator/authority, regulatory pack, pack version, application/assessment, legal entity/provider, regulated service/activity, location/site, responsible individual/role, requirement/question/control, applicability decision, evidence requirement, evidence item/version, draft response, reviewer decision, finding/gap, remediation, risk, task, inspection/interview, correspondence/RFI, submission package, certificate/registration/permission metadata, renewal/expiry, ongoing obligation, monitoring event and audit event.

## Regulatory pack model

One compliance engine hosts FCA, CQC, Ofsted, Aramco, NCA, ISO, buyer/tender and custom enterprise packs. Packs are data plus reviewed rules, not separate codebases.

A pack can declare jurisdiction, regulator, service/activity types, applicability questions, required roles, requirements/questions, evidence types, workflows, review gates, renewal periods, inspection preparation, source references and effective dates.

## Integration with existing Omniqora

Reuse Tenant/Identity/Entitlements, RRCI/RAG/GraphRAG, Business360, CRM, Workflows/Agents, Connect, Documents, Audit, Analytics and Enterprise AI Governance. Do not create duplicate identity, CRM, workflow or evidence databases unless a deployment boundary requires physical isolation.

## Human approval gates

AI must not independently decide final regulatory perimeter, determine legal/regulatory compliance as a final opinion, submit an application, send a regulator response, certify an organisation, represent regulator approval, alter a regulated permission, make safeguarding/clinical suitability decisions, make final fit-and-proper determinations or approve a cybersecurity certificate.

## Commercial forms

The same engine can be sold as self-service SaaS, managed Compliance-as-a-Service, consultant/adviser workspace, white-label platform or enterprise multi-entity compliance control plane. Professional-services partners can operate a client portfolio while each customer remains a separately isolated Omniqora tenant/workspace.