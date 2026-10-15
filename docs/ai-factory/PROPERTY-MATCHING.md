# Property Matching — Omniqora + Gabley

## Product ownership

- **Gabley** remains the authoritative estate-agent/lettings/HMO/commercial property platform. It owns listing publication, asking price, availability, source agencies, buyer/renter requirements, viewing and offer decisions.
- Omniqora provides the **optional** `omniqora.property-matching` shared service, agent templates, scoped Connect/CRM, analytics and approval rails.
- Other property products (PropConnect, Immoviq, SharedBricks, HMO Hub, DOMUREVA, AXIOM) may opt in only through their own reviewed listing and customer-permission adapters.

The shared property matching service is registered in the SaaS Factory as **beta / catalogue-only**. It is NOT a certified end-to-end cross-platform data integration.

## Source feature built in Gabley

Source PR: https://github.com/asaffilate01-ship-it/remix-of-property-nexus/pull/5

Gabley `/property-matches` uses its existing public `fetchListings` route, limited to published and marketplace-enabled listings. A deterministic matcher applies user-selected:
- Purchase vs rent vs HMO/room vs commercial intent
- City or postcode/outcode
- GBP asking price, or GBP PCM for rent
- Minimum bedrooms/bathrooms and property type
- Preferred features such as parking, garden, wheelchair access, EV charging, lift or pets

Mandatory constraints eliminate unsuitable records; soft preferences rank the remaining listings with traceable reasons. Exclude unknown prices, currencies, under-offer/let-agreed, private and missing-authority records. Do not fabricate valuations, distances or property availability. The current source search returns at most 120 of the visible listings; it is not a complete national matching index.

## CRM matching and one-click AI workflow contract

Proposed Omniqora AI use-case: `property.matching` with `property.listings.read` capability. A future source adapter will deliver only customer-authorised criteria and listing references (never privileged agency CRM exports by default).

A one-click task can:
1. Ask the authenticated user to specify buy/rent/investment/commercial/HMO and explicit priorities.
2. Resolve the source-tenant, agency, data rights and permitted listing subset at Gabley.
3. Apply deterministic matching with source-cited scores/reasons and missing-data indicators.
4. Optionally draft viewing enquiries, alerts, saved searches, a property tour or an agent CRM follow-up.
5. Request **human/customer approval** before any message, booking, lead dispatch, public listing change, offer, screening decision or personal-data sharing.
6. Recheck listing status, asking price, actor permissions and customer consent before any downstream action; create an auditable receipt.
7. Track per-tenant cost and provider consumption if an LLM is used for query interpretation or explanations.

No model is needed for numerical filtering/matching itself. Only complex natural-language interpretation or draft-generation should invoke an LLM, subject to cost and privacy controls.

## Housing fairness and data protection

- Do not infer or score customers based on race, nationality, religion, family status, disability, age, income proxy or other protected traits.
- An **explicit accessibility requirement** can be used to filter *property features*, not to classify or deny applicants.
- The agent must never autonomously decide a person's eligibility to rent/buy, issue a refusal, process a deposit, approve a mortgage or recommend discrimination.
- Published listings and agency-confidential leads have separate access policies. Do not use public MCP server discovery as permission to ingest private agency data.
- Clear customer opt-in, purpose restriction, GDPR data minimisation, deletion and human review are required for persistent profiling/CRM outreach.

## Activation/readiness

- Gabley property-matching route is currently a **source-only draft**, not released.
- Gabley source CI currently has an incomplete npm lockfile and other dependency-review gates; deterministic matching tests can be run independently but app build has not passed.
- Omniqora add-on requires migration review, independent agent approval, service entitlement, Gabley source credential/tenant validation, provider health and staged end-to-end tests.
- Do not create live tenant accounts or export client details from this template.
