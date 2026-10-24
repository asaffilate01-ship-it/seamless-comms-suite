# iTechEducation landlord

Owner-directed hierarchy, 24 October 2026. This supersedes the proposal to make Skillfinch the education landlord.

Omniqora SaaS Factory provides the shared control plane. iTechEducation is the education landlord. Ilmvero, TrainDirekt, Skillfinch and UniPathway are its four brand tenants. Their existing source applications remain separate during migration.

## Source change implemented

The portfolio registry now represents one landlord and four draft tenants. Historical source rows and former product identities are retained on the tenant entries. Skillfinch maps to care-quest-learn; dreamweaver-canvas-74 contains legal software and is not its migration source. Other repository mappings have accessible READMEs but need application audits before migration. No domain, database, subscription or tenant has been provisioned by this registry change.

## Target responsibility split

| Layer | Responsibility |
|---|---|
| SaaS Factory | Product connections, tenant identity, provisioning, service entitlements and platform audit |
| iTechEducation landlord dashboard | Brand onboarding, plans, module access, domains, platform staff, usage and subscription oversight |
| Brand tenant dashboard | Own branding, catalogue, admissions, organisations, staff, learners, fees and reports |
| Role workspaces | Learner, tutor, assessor, quality, finance, agent and partner access where the relevant modules are enabled |
| Shared education modules | LMS, live teaching, recordings, resources, assignments, assessments, attendance, certificates and learning analytics |

These are implementation targets, not claims that all dashboards or modules are functional today. Brand organisations, campuses and employer accounts remain scoped below their tenant, not parallel Factory landlords. Enable country-specific funding and qualifications only for the appropriate brand and approved offering.

## Migration contract

- Preserve existing application user and organisation IDs; map Factory tenant IDs through explicit product connections. Never derive authority from a hostname, logo or client-selected tenant ID.
- Require server-side tenant membership and module entitlement checks. Deny unknown, expired or suspended connections. Landlord oversight does not automatically grant access to learner records or recordings.
- Keep tenant records, storage, grades, payments, recordings and audit events isolated. Share course templates only through explicit publication/licensing; copying a template never shares enrolments or learner work.
- Keep subscriptions owed to iTechEducation separate from tuition owed to each brand. Preserve currency, payment account and regional requirements.
- Retain the existing applications until a tested migration has reconciliation counts, rollback evidence and explicit cutover scope. Catalogue reclassification is not a database rename.

## Remaining implementation gates

1. Audit all four app schemas, routes, roles and deployments; resolve the historical TrainDirekt README's overlapping pathway scope.
2. Reconcile care-quest-learn draft PRs #12, #14 and #15. PR #12's CareQuest master must not become a second landlord; its draft-media and saved-resource access policies need review before reuse.
3. Implement the iTechEducation landlord dashboard and verified Factory connections, then connect tenant-specific dashboards and shared LMS services.
4. Test cross-tenant denial, organisation selection, signed media URLs, role revocation, subscription enforcement and payment-webhook isolation.
5. Validate course content, practical assessment workflows, recordings, email and payments in staging before any production cutover.

The registry and audit tests establish source hierarchy only. They do not establish runtime tenant isolation or launch readiness.

## Employer partnership dashboard

Employer partners sit within a brand tenant's organisation boundary. They can be enrolled for internships, training and jobs. Organisation administrators approve access and assign a student, academic supervisor and workplace supervisor, with dates and review deadlines. Employer administrators oversee their company's assignments; workplace supervisors see their assigned students; students see their own records. Completion requires an academic review and administrator approval. Shared progress notes and an immutable audit history support supervision.

The initial implementation is in the Skillfinch source application at `/employers`, using its existing organisation boundary. It must not be advertised as operating across all four brands until each product connection and tenant isolation has been verified. A training placement does not itself create an LMS enrolment or award a certificate.
