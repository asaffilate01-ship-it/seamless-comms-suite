# MarshCrunch — Omniqora SaaS Factory tenant blueprint (19 November 2026)

**Requested architecture:** Omniqora SaaS Factory → Merqano commerce landlord → MarshCrunch retail tenant. This is a new **merchant tenant**, not a new SaaS product or independent Lovable app.

## Recorded source state
- Tenant key: marshcrunch
- Merchant name: MarshCrunch
- SaaS product key / parent landlord: merqano
- Blueprint: merqano.marshcrunch
- Retail vertical: multi-category-consumer-goods
- Intended collections: tissues, fragrances, soft drinks, chocolate bars
- Provisional UK/GBP template (merchant administrator must approve region and currency).
- Blueprint status: draft
- Provisioning state: not_activated
- Canonical Merqano repository: asaffilate01-ship-it/bakery-web-bloom, where storefront/logo implementation is maintained.

The portfolio registry remains a source inventory. It is not evidence that a customer tenant, a payment account, a custom domain, product listings, a database row or a deployment exists.

## Controlled activation
1. Factory administrator creates/reuses the real Omniqora organisation and tenant. Verify unique slug marshcrunch and chosen country, currency, legal operator and ownership.
2. Add product merqano, choose approved entitlements and services, then run the existing idempotent Factory provisioning job and Merqano provision_tenant receiver. Never create independent duplicate tenant identities.
3. Confirm Merqano external tenant UUID on the Factory product link; bind its scoped control-plane connection; monitor connector readiness. No credential values belong in source control.
4. Assign authorised merchant admins/staff with tenant-scoped access. Apply branding, logistics, policies, checkout provider routing and import actual stock through Merqano.
5. Test data isolation, payment success/failure/webhook confirmation, refund/manual financial exceptions, delivery fees, audit logs and all four categories before activating.
6. Complete verified domain and TLS routing, mobile/desktop QA and staged end-to-end tests. Only then move from draft to active.

## Verification
Run from Omniqora checkout with dependencies available:
- node --test verification/control-plane/portfolio-factory-audit.test.mjs
- node scripts/factory-portfolio-audit.mjs --strict
- node --test verification/control-plane/merqano-factory.test.mjs
- npm run typecheck
- npm run build

The Merqano repository separately runs test:marshcrunch, test:commerce, typecheck and build. Both repositories require connected deployment and live tenant checks.
