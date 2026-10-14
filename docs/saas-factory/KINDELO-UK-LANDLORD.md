# Kindelo UK — Omniqora SaaS Factory integration

**Scope:** England. Factory catalogue/contract foundation only. Not a tenant migration, completed SaaS provisioning, an Ofsted approval, or a go-live release.

## Canonical hierarchy

```text
iTechLounge / Omniqora SaaS Factory (control plane)
└── Kindelo product (childcare SaaS landlord; canonical source: kindelo-uk)
    ├── Kindelo UK operating workspace (first customer of the platform; Ofsted approval required for CMA services)
    ├── Independent white-label Childminder Agency (each has its OWN Ofsted CMA registration)
    ├── Childcare software-only customer (no inherited CMA authority)
    └── Optional nanny operator (separate employment/childcare rules)
```

Germany legacy Kindelo/KinderStars stays outside this UK migration. The pre-existing `kindelo-de` blueprint is **not** modified.

## Source of truth by domain

| Domain | Owner |
| --- | --- |
| Tenant identity, product catalogue, entitlements, branding, domain validation, SaaS billing, provisioning | Omniqora |
| Prospective/registered childminders, parents, children, safeguarding cases, local provider decisions, EYFS records, booking operations | Kindelo UK |
| Government-funded childcare claims and payment routing | The correctly authorised operator and relevant scheme; Omniqora may provide technical connectors only |
| Childcare registration approvals and enforcement | Ofsted and the appropriately registered agency per tenant; not transferable from Kindelo |
| Training course content, assessments and certificates | SkillFinch; Kindelo receives independently verified training evidence |
| Childcare fees and payouts | Approved payment architecture; provider-specific onboarding/settlement and reconciliation |

## This factory implementation

1. Product `kindelo` is updated to identify `kindelo-uk` as canonical source and an external childcare landlord.
2. New add-on catalogue entries are added as **beta, disabled** by default.
3. UK white-label launch blueprint `kindelo-white-label-gb` is **draft**, not launchable without prerequisites.
4. Workspace kinds are catalogued: landlord, operator, agency_tenant, software_tenant, nanny_tenant.
5. No tenant is provisioned; no provider data, child records or certificates are copied.
6. The factory launch contract accepts England-only and checks for reviewed regulator evidence when an agency is labelled approved.
7. The operational app remains on its own Supabase project; Kindelo users' Supabase JWTs must never be used as global Omniqora factory credentials.

## Migration: build, shadow, cutover

### Phase A — finish working Kindelo UK

- Restore clean npm release gate; verify parent, applicant, childminder, owner/admin role journey.
- Confirm private Supabase migrations/restore evidence and RLS for children, parents, safeguarding/financial records.
- Fix applicant self-ticked suitability statuses and simulated Ofsted inspection grades.
- Submit Kindelo UK's own CMA application with suitable registered person/NI/DSL/QA capacity.
- Test SkillFinch linkage without relying on unverifiable course accreditation.

### Phase B — attach Kindelo UK to Omniqora

- Register a real Omniqora tenant and request product binding after security/commercial approval.
- Implement *server-to-server* control-plane connector with one-time `oqcp_` credential; never expose in VITE_ keys or browser.
- Match `productKey='kindelo'` and `external_tenant_id` to one authorised Kindelo workspace.
- Shadow-sync only opaque tenant + entitlement references; no copying child/patient/safeguarding records.
- Compare branding, correct permissions, service gates and billing while legacy Kindelo continues serving existing users.
- Once parity and evidence passed, make Omniqora authoritative for product subscription/tenant configuration; Kindelo remains authoritative for childcare.

### Phase C — optional white-label onboarding

- Confirm tenant legal entity, UK data controller/processor terms, software licence, insurance, Ofsted/registration representations and competent safeguarding cover.
- Enrol custom domain only after DNS/SSL ownership verification and approved brand configuration.
- Tenant auth and all data queries must derive scope from server-validated current membership/domain binding, not from user-supplied tenant id or website query string.
- Migrate the older Kindelo operating records into a verified operator workspace **only after** complete row ownership inventory, reversible migration and RLS negative tests.
- Validate isolated end-to-end parent and childminder flows with two tenant test orgs.
- White-label CMA actions require the tenant's **own verified Ofsted approval**; software-only tenants have no agency registration features.
- Audit usage and charge white-label setup, subscription and approved modules separately. Do not count third-party childcare GMV as Kindelo software revenue.

## Provisioning must remain fail-closed

Factory sees a draft blueprint, but never auto-activates a white-label tenant merely because a user selects a plan.

A production binding requires:
- Kindelo external tenant workspace created via a secure backend endpoint
- Verified HTTPS product URL and tenant domain
- Omniqora control-plane shared secret in server-side vault
- Idempotent bind receipt and workspace owner verification
- Correct tenant RLS and feature-gate matrix
- Professionally reviewed Ofsted registration evidence for a regulated agency tenant
- A green release gate, staging acceptance, backup/restore and incident response plans

No one should copy a regulator approval between workspaces, invent a registration number or declare a training/childcare service ready based on UI alone.

## Relevant code

- `supabase/migrations/20261014110000_kindelo_uk_white_label_factory.sql`
- `src/modules/control-plane/kindelo-factory.contracts.ts`
- `verification/control-plane/kindelo-factory.test.mjs`
- `asaffilate01-ship-it/kindelo-uk` — canonical vertical codebase.

**Do not set a Kindelo factory provisioning adapter to active until Kindelo's workspace backend and two-tenant tests exist.**
