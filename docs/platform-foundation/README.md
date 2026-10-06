# Omniqora Platform Engines v1

This folder defines the additive platform architecture used to consolidate the portfolio without disturbing existing SaaS products.

## Safety boundary

This branch is source-only. Nothing in this folder:

- deploys the application;
- applies a Supabase migration;
- changes an existing SaaS repository;
- moves customer or tenant data;
- changes live authentication, domains, provider credentials or billing;
- removes existing product-owned workflows.

Existing products remain authoritative until an explicit migration is approved and tested.

## Target platform

Omniqora becomes the shared control and intelligence plane. Products such as Dishbee, Haccora, TaxNuvia, XpertJobs and Fleetora remain domain landlords, but progressively consume common engines.

### Control plane

- tenant / organisation registry
- identity and membership
- product catalogue
- plans, entitlements and quotas
- provisioning
- region packs
- domains
- integration bindings and secret references
- service identities
- signed events
- audit and observability
- usage and metering

### Shared engines

- Omniqora CRM
- Omniqora Connect
- Omniqora Payments
- Omniqora Journeys
- Omniqora Sales
- Omniqora Feedback
- Omniqora Geo
- Omniqora Dispatch / Fleet
- Syndriva Marketplace Engine
- Omniqora Agent
- Omniqora Intelligence

### Intelligence and transformation

Existing Omniqora work remains first-class:

- Business360 audit / discovery
- M&A, merger, acquisition and carve-out planning
- Day-1 / TSA / 100-day planning
- Enterprise AI governance
- GenAI provider abstraction
- RAG and evidence retrieval
- GraphRAG / knowledge graph
- governed agents and approvals
- AI budgets and evaluations
- AI Reception

### Compliance packs

The same evidence, workflow, control, audit and approval infrastructure supports reusable compliance packs such as:

- Aramco supplier / CCC readiness
- SACS-210 control/evidence workspace
- NCA / SAMA / ISO and other reviewed framework packs
- industry and customer-specific assurance packs

A pack never claims certification. It manages applicability, evidence, gaps, actions, reviewers, expiry and audit history; an authorised external assessor or competent reviewer remains responsible for formal certification/assurance.

See SHARED-ENGINES.md, COMPLIANCE-TRANSACTION-PACKS.md and MIGRATION-GUARDRAILS.md.
