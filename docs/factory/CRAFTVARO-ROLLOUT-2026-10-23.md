# Craftvaro core fixes and Factory rollout — 23 October 2026

Craftvaro is the canonical trades and project product, backed by jobflow-tradehub and Lovable project 27b4c132-3281-4ca4-a913-7ce0f7915510. It retains domain records and local authority. Factory owns catalogue, country templates and future governed shared services.

## Deployed and verified

The five 20260912 migrations and 20261023073508 transactional-workflow migration were first rehearsed in a rolled-back transaction, then applied together through the authorised Lovable SQL connector. Their exact SQL and versions were recorded in supabase_migrations.schema_migrations in the same transaction. Schema reload was requested. Subsequent reads confirmed all six migration records and the project, subcontract, business-metrics and material/award RPCs. No historical migration identifiers were rewritten and no existing customer rows were replaced.

The separate Omniqora migration 20261023073521 registers Craftvaro and its external core service, with draft GB/DE country blueprints. Its deployment and disabled automatic provisioning were independently verified. This is Factory registration, not a tenant or shared-service cutover.

## Source changes awaiting release

- KYC uploads remain authenticated but do not require prior KYC approval. Missing or failed lookups no longer approve access.
- Ordinary project awards execute atomically with ownership, availability, verification and paid-subscription checks; repair awards keep their existing RPC.
- Material requests save header/items/delivery atomically, validate company/job/merchant/account, calculate delivery rates on the server and deduplicate retries.
- Smart comparison saves collection requests atomically. It does not claim merchant acceptance or payment. Delivery booking from comparison remains gated pending route/rate confirmation.
- compare-prices forwards the user session and checks company, Premium subscription, job ownership and item bounds. Deploy this Edge Function with the source release; it has not yet been deployed by the SQL changes.
- Driver board uses a narrow RPC and withholds exact addresses before acceptance. Server transitions reject unavailable offers, competing acceptance and skipped steps. Its migration 20261023074153 is NOT yet applied: it revokes direct delivery UPDATE, so apply only with both updated driver screens, after preview validation.

## Release sequence

1. Review/merge source PR; preserve Lovable .env, previewAuthStorage.ts, claimable directory and current lockfiles.
2. Deploy compare-prices. Run both driver screens against a matching preview/staging backend; apply the driver migration during the coordinated release, not ahead of the old frontend.
3. Smoke-test customer, pending trader, approved Premium trader and verified driver flows. Database tests are disposable fixtures, not production-account acceptance evidence.
4. Reconcile PR #7 subcontract activity/notifications separately; PR #6 Veyumo remains optional and gated.
5. Establish verified tenant mappings, signed adapter credentials, replay/idempotency tests and event minimisation before Factory shadow mode. Keep local authority until parity and cutover approval.
6. Complete merchant confirmation/dispatch integration, payment settlement, notification recovery, German workflows and device acceptance. No merchant purchase, payout, public publication or customer-data migration was performed here.

## Limits

Material requests retain manually entered/catalogue estimate prices. Suppliers must confirm price, stock and fulfilment. New platform deliveries remain unassigned until a confirmed merchant workflow dispatches them. Existing legacy direct order-write policies and verification history still require a broader access review. Factory GB/DE templates do not provision actual tenants or introduce German prices. Existing basic/premium billing stays local.
