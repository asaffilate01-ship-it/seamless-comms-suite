# Procurement & Partner Readiness

Implemented in the existing Omniqora suite at `/app/procurement-readiness`, with a public services entry on the existing marketing page. The priority pathway is **Aramco CCC+ cybersecurity**. The module also includes Saudi Aramco supplier registration, UK government procurement, US federal procurement and investment-bank supplier preparation.

## Delivered

- Five source-linked, versioned starter packs containing 56 planning areas. They are not exhaustive control libraries or a legal determination of applicability.
- Persistent company assessments scoped to a legal entity, target buyer, country and service boundary.
- Custom tender questions and individual SACS-210 control records, with applicability, required evidence and source references.
- Evidence references to a customer's secure repository, owners, actions, due dates, issuer/reference and expiry dates.
- Separate editor and reviewer permissions. Evidence changes clear internal review; expired evidence is excluded from completed progress. Admins can edit and review, with actor identity recorded; this release does not enforce independent four-eyes review.
- Reviewer reasons for acceptance, requests for work and justified exclusions. CCC+ core milestones cannot be excluded. Certificate review requires actual issuer, reference, secure evidence link and expiry.
- Gap, awaiting-review and expired-evidence filters; 30-day renewal counts and overdue actions.
- A JSON supplier dossier with scope, internal review status and reported credentials. It excludes private evidence links, notes, staff details and audit actor IDs. Export creates an audit event; it does not submit to a buyer.
- Append-only application audit records and optimistic version checks for edits/reviews.
- An optional source-linked question panel using the existing RRCI knowledge service. It only searches approved connected sources; checklist URLs are not automatically ingested. It cannot issue certificates, change review outcomes or make submissions.
- Desktop, tablet and mobile layouts using the current application shell and login.

## CCC+ comes first

The 16-area CCC+ pathway covers classification, full scoped control mapping, implementation evidence, assessor engagement, on-site preparation, findings, issued certificate/report and maintenance. The actual detailed SACS-210 control register must be entered and assessed for the engagement. Completing high-level planning areas is not proof that every underlying control is satisfied.

Sources checked on 16 September 2026:

- [Aramco CCC/CCC+ process and authorised audit firms](https://www.aramco.com/en/what-we-do/suppliers/supplier-resources/cybersecurity-compliance-certificate-program)
- [SACS-210, February 2026](https://www.aramco.com/-/media/downloads/working-with-us/ccc/sacs-210-third-party-cybersecurity-standard.pdf)
- [Aramco supplier registration](https://www.aramco.com/en/what-we-do/suppliers/become-a-supplier)

The programme page's classification table and FAQ disagree for Network Connectivity. The product therefore requires confirmation from Aramco/the authorised assessor and does not automatically select CCC or CCC+. A historical SACS-002 certificate must not be relabelled as SACS-210 or CCC+ by the software. Store the actual scope, issuer, period and reference. The official programme page describes CCC+ as an on-site assessment by an authorised firm.

## Other buyer packs

- UK: use the appropriate regime for the authority and procurement; Scottish devolved and transitional procurements need separate consideration. Find a Tender registration is not universal government supplier approval. [Supplier guidance](https://www.gov.uk/government/collections/information-and-guidance-for-suppliers), [devolved authorities](https://www.gov.uk/government/publications/procurement-act-2023-guidance-documents-plan-phase/guidance-devolved-contracting-authorities-html), [Cyber Essentials](https://www.ncsc.gov.uk/cyberessentials/resources).
- US: registration, eligibility, representations and contract clauses are separate matters. Cyber, cloud and defence obligations depend on scope and current clauses/deviations. No fixed CMMC rollout date is embedded. [SAM](https://sam.gov/entity-registration), [FAR](https://www.acquisition.gov/browse/index/far), [DFARS deviations](https://www.acq.osd.mil/dpap/dars/dfars_far_overhaul_class_deviations.html), [FedRAMP scope](https://www.fedramp.gov/2026/scope/).
- Investment banks: this covers vendor onboarding, not a licence to undertake regulated investment banking. A bank's private questionnaire and contract must be added. [JPMorganChase supplier programme](https://www.jpmorganchase.com/about/suppliers), [minimum controls](https://jpmorganchase.com/supplierdiversity/oversight), [Goldman Sachs vendor programme](https://www.goldmansachs.com/our-firm/our-vendor-program).

## Ownership and integrations

Omniqora owns the module interface and reuses Core identity plus RRCI workspaces, membership and `rrci` entitlement. RegulaOS retains ownership of authoritative obligations, specialist evidence and regulatory-change decisions. Tendryva retains tender discovery/bid workflows. References to those products may be linked as evidence, but this release does not claim a live API bridge or duplicate their backends. A future bridge must carry tenant/workspace and source record identifiers, verified credentials, idempotency, consent, retries and an audit trail.

Business360 and the shared knowledge service remain separate modules. Dossier JSON has schema `omniqora.procurement-dossier.v1`; reuse it behind explicit identity/entitlement and evidence interfaces if a standalone edition is introduced. No separate repository or application is created.

## Activation

1. Apply the committed migrations in order, including `20260916160000_procurement_readiness.sql`, to the project's Supabase database through the normal controlled migration process. Existing RRCI and tenant tables are prerequisites. No deployment database is modified by the tests.
2. Enable the tenant's existing `rrci` entitlement through trusted billing/operator administration. Users cannot self-enable entitlements.
3. Create or reuse an RRCI workspace and assign its module members using trusted administration. The existing `create_rrci_workspace` RPC can create a workspace for an eligible tenant owner/admin. Readers can view/export, editors can prepare records, reviewers can decide applicability and review evidence, and admins can perform both.
4. Publish the repository application through its existing Lovable deployment. The route and service entry are part of the normal app build.
5. The checklist and evidence metadata work directly with Supabase. Optional AI answers additionally require the existing `RRCI_BINDINGS_JSON` mapping and knowledge service deployment.

Not included: certificate issuance, buyer-portal automation, live official-status verification, scheduled source-change monitoring, automated reminder delivery, native evidence uploads, or complete licensed control libraries. The module shows renewal and action dates in-app. Evidence stays in the user's secure document store. Any external assessments, certification fees and technical remediation are separate engagements.

## Verification

Run `npm run build`, `npm run typecheck`, `npm run test:security`, and `npm run test:procurement`. The focused suite runs disposable PostgreSQL tests for tenant isolation, entitlement expiry/suspension, member revocation, edit/review roles, stale versions, mandatory CCC+ gates, evidence expiry, audit permissions and dossier privacy. No secrets or production records are used.
