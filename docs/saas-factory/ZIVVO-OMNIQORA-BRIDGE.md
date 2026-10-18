# Zivvo / Omniqora SaaS Factory bridge (GB and DE)

Status: source integration, disabled for unbound dealers. This is not a production-activation report. Zivvo UK and Zivvo Germany retain separate Supabase databases and their own dealer, listing, billing and inventory authority.

## Tenant identities

- Canonical SaaS product: zivvo.
- Zivvo UK external tenant ID: GB:<dealer_uuid>.
- Zivvo Germany external tenant ID: DE:<dealer_uuid>.
- Each approved dealer has its own Omniqora tenant ID; it is never substituted for a product-local UUID.
- Both new launch blueprints start as draft and do not create tenants or activate products.

## Connector setup (per approved dealer)

1. Verify the dealer, roles and local dealer record in the correct GB/DE Zivvo database.
2. From Omniqora SaaS Factory create an organisation and tenant, attach product zivvo, and link external tenant ID GB:<uuid> or DE:<uuid> with product_connections.
3. Only activate shared services specifically contracted and approved for that dealer.
4. Generate a one-time oqcp_ credential for that product and external tenant in Omniqora. Never commit it or send it to browsers.
5. Set secrets in the appropriate Zivvo Supabase Edge Function store: OMNIQORA_PUBLIC_URL (HTTPS origin), OMNIQORA_DEALER_CONNECTOR_KEYS (JSON object mapping local dealer UUIDs to per-dealer oqcp_ credentials), and allowed app origins (APP_URL and ALLOWED_ORIGINS). Keep UK and German deployments separate.
6. Deploy omniqora-tenant-snapshot (authenticated JWT). Test authorised dealer, another dealer (403), incorrect secret, stale entitlement, suspended product or tenant, and upstream outages.
7. Configure WhatsApp sender, AI provider, DMS integrations, finance permissions, Stripe and custom domains separately, only after contractual approvals and provider testing.

## Scope

The Zivvo server checks the authenticated user against its own database for dealer ownership or active staff membership. It then calls Omniqora POST /api/control-plane/tenant-snapshot with a dealer-scoped key and explicit product/external-tenant assertions. The browser receives only status and a filtered entitlement list, never connector secrets, customer records or internal credentials.

Missing keys, incorrect binding, suspended or expired services and upstream errors fail closed. Existing Zivvo subscriptions, quotas and native inventory access remain locally authoritative; Omniqora add-ons cannot silently change them.

## Required staging acceptance

- Apply and reconcile migrations without altering customer accounts or subscriptions.
- Prove buyer/other-dealer denial and legitimate dealer JWT access.
- Validate snapshot tenant bindings, no-store responses and the six explicit opt-in services.
- Check trial/active vs expired, suspended, requested and missing services.
- Confirm no payment, provider integration or autonomous write activation occurs.
- Retain passing checks for both GB and DE plus independent production approval.

The scheduled provisioning worker is not enabled by this source commit.
