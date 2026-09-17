# Implementation handover — Business360 v0.3

Start with START-HERE.md and verification/RESULTS.md. Preserve the shared engine and UI across the Omniqora add-on and standalone host. Preserve the user's required order: business, departments, people/stakeholders, then discovery, audit, performance and plans. Do not turn employee/stakeholder records into login grants.

The package contains executable source, not a live deployment. Integrate through a normal branch in the existing TanStack/Supabase host without rewriting Git history. Build the host, validate its current auth context/types, review/apply the private PostgreSQL migration, provision the dedicated runtime login, configure entitlements and service secrets, and run the integration tests against disposable and then target-like infrastructure. Keep SQLite explicitly local-only.

For the next product increment, prioritise one authorised accounting/CRM connector and source-document ingestion with evidence provenance before broad autonomous execution. Add managed standalone identity (SSO/MFA, invites and recovery) and authoritative subscriptions before general self-serve selling. Enforce department/document/deal-room permissions before introducing data with those confidentiality requirements. Keep estimated improvements separate from verified outcomes.

Do not claim the unreadable second shared chat, separately packaged Enterprise Governance & Adoption extension, Recovrable API, billing, live models, cloud migrations, company-wide automated discovery or production deployment have already been merged. Resolve those source/integration details explicitly.
