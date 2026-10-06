# Property intelligence and regeneration network

## Boundary

Omniqora is the reusable intelligence/control plane. Gabley and DOMUREVA remain independent systems of record with their own databases, users, permissions and transaction decisions.

- **Gabley** owns property, seller, buyer/investor, offer, disclosed fee and transaction-progression records.
- **DOMUREVA** owns empty-home/regeneration cases, reviewed scheme rules, application evidence and funding-stack decisions.
- **Omniqora** provides tenant-scoped AI/intelligence runs, CRM/matching primitives, governance and reusable property-intelligence services.

No migration copies a Gabley or DOMUREVA domain database into Omniqora.

## Services

The factory registers:

- `omniqora.property-intelligence`
- `omniqora.property-scout`
- `omniqora.deal-detective`
- `omniqora.property-underwriter`
- `omniqora.property-match`
- `omniqora.vacancy-scout`
- `gabley.deal-room`
- `domureva.funding-intelligence`
- `domureva.gabley-sync`

All external source ingestion must use permitted APIs, licensed feeds or explicitly authorised source adapters. A source URL or search result is evidence, not permission to scrape.

## Activation

Catalogue presence does **not** activate a tenant. For a Gabley or DOMUREVA tenant:

1. provision the product/blueprint;
2. enable only the purchased services;
3. create a tenant-scoped service or product connection with the minimum intelligence capabilities;
4. map the external tenant id;
5. keep source credentials server-side;
6. run two-tenant isolation, revocation and stale-credential tests;
7. mark the connection live only after controlled smoke testing.

## Review gates

Property valuations are decision support, not formal valuations. Vacancy is probabilistic until verified. Funding matches are eligibility assessments only; the administering authority makes the decision. Deal fees and conflicts must be handled in the source product's reviewed transaction workflow.
