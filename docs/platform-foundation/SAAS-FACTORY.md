# SaaS Factory

The goal is to make a new SaaS or tenant mostly configuration.

## Product creation

A product blueprint defines:

- industry;
- regions/countries;
- locales/languages;
- modules/add-ons;
- roles;
- navigation;
- domain objects;
- workflows;
- mobile capabilities;
- branding defaults.

Use `src/modules/platform/blueprints.ts` as the initial catalogue.

## Tenant creation

A tenant request chooses:

- product;
- region pack;
- locale;
- plan;
- modules;
- brand;
- locations;
- domains.

`planTenantProvisioning()` resolves dependency closure and produces an explicit provisioning plan.

## UI generation

`src/modules/platform/ui-schema.ts` keeps navigation and dashboards configuration-driven. Lovable can style and compose these surfaces without changing platform ownership.

A module can be hidden from navigation when not entitled, but server/database entitlement checks remain mandatory.

## Bespoke work

New SaaS development should focus on:

1. genuinely unique domain objects;
2. unique business rules/workflows;
3. specialised UI/UX;
4. branding/content;
5. unavoidable provider or regulatory integrations.

CRM, messaging, marketing, sales, analytics, financials, AI, compliance, marketplace, routing/dispatch, payments, mobile and creative should normally be enabled rather than rebuilt.

## Country/language expansion

Prefer region and locale packs instead of forks. A country pack owns currency, timezone, tax/legal profile, regulatory packs and provider preferences. A locale pack owns text/formatting/RTL behaviour.

## Scale target

The application code must not assume one database forever. Every shared record is tenant-scoped so later data-plane routing can move tenants to different database clusters or regions without changing product code.
