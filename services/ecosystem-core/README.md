# iTechLounge Ecosystem — standalone internal platform, version 3

Start here. Version 3 supersedes the earlier setup instructions. Run `app.py`, not `core.py`, for the standalone platform.

## What it does
- Private web administration interface served by the Python application: register SaaS products, issue/rotate app credentials, register providers, manage business memberships, configure discount rules, inspect referral counts and webhook deliveries, retry failed deliveries.
- Shared cross-selling catalogue and approved referral APIs; React screens for existing apps.
- Business account linking: initiate a 10-minute single-use code in one authenticated business account, redeem in the specified second app. No automatic linking based on matching email addresses.
- Signed subscription webhooks with timestamp checks, payload integrity, duplicate detection and per-organisation monotonic version handling.
- Discount eligibility: active paid subscription in the source app and target app, confirmed business link, highest applicable rule only, no stacking with another promotion. The agreed 20% Haccora → EventPlanr rule is installed by the setup command.
- Durable outbound webhook queue with leases, retries, backoff and failed-delivery recovery. Events communicate a subscription-only percentage effective at next renewal. Worker also removes eligibility when subscription validity expires, without requiring a new incoming event.
- Server connector examples for verified auth, membership sync, subscription events and discount receipt.

## Where it belongs

| Location | Install |
|---|---|
| ONE new private repository/project: itechlounge-ecosystem | This backend, standalone admin UI, database and worker |
| Haccora | React customer components plus authenticated server adapter and billing/membership event sender |
| TaxNuvia | Customer components; provider ReferralDashboard for each verified firm; server adapter |
| EventPlanr | Customer/vendor components, server adapter, subscription-event sender, durable discount receiver and its billing adapter |
| Every new SaaS | Register centrally, provision server credentials, integrate only relevant API/event capabilities |

Do not upload a separate copy of the central database into every SaaS. Each app keeps its own customers, login, operations and payments. Central subscription eligibility records are not a substitute for each product's authoritative billing/feature access checks.

## Start locally (Python 3.10+)
No third-party Python dependencies. Set environment variables via your shell or a secret manager:
- ECOSYSTEM_ADMIN_USER: central administrator username (default admin)
- ECOSYSTEM_ADMIN_PASSWORD: a random password of at least 20 characters
- ECOSYSTEM_DB: durable SQLite path (default ecosystem.db)
- ECOSYSTEM_WEBHOOK_ENDPOINTS: JSON mapping app slugs to operator-approved HTTPS discount-receiver URLs, e.g. {"eventplanr":"https://YOUR-EVENTPLANR-HOST/api/ecosystem/discount-webhook"}

```
python3 setup_network.py
python3 app.py
```

Open http://127.0.0.1:8787 and sign in. In a second process run `python3 worker_loop.py`. The seeded catalogue does not activate any actual provider. Add verified providers in administration.

## Docker alternative
Set the variables above in the deployment environment. Then:
```
docker compose up -d --build
docker compose exec ecosystem python3 setup_network.py
```
The service binds host loopback port 8787. Both containers use one persistent volume. A worker runs every minute. Docker image build was not executed in this environment.

## Production hosting
Deploy centrally on a private host with TLS reverse proxy, administrative VPN/access gateway (prefer MFA), rate limits and request timeouts. The included HTTP Basic admin login is a small-team bootstrap login; use the gateway for staff identity, MFA and revocation before broad team rollout. Never expose Basic authentication over plain HTTP. Restrict /admin and UI paths to the administrative network; restrict API/webhook access appropriately. Browser clients must never hold app credentials.

SQLite and one shared persistent filesystem are suitable for initial single-host deployment. Do not run multiple distributed replicas with independent SQLite files. A PostgreSQL/Supabase migration with verified RLS is still required for that architecture. Back up and encrypt the volume: webhook signing keys are stored in the credentials table, API tokens are hashed. Rotate credentials centrally and update the corresponding app's secret manager immediately.

This Python backend cannot run just by uploading it to a Lovable frontend. You can retain the supplied standalone admin UI, or mount React administration in a separate frontend after adapting its admin routes. Version 2's CentralAdmin component uses a different admin route contract; the standalone web/ interface is the version 3 admin UI.

## Connect an app
1. Register its slug, name, sector and country in the central UI. Use GB, DE or GLOBAL. A slug represents one independently connected service; country-specific deployments may use separate slugs. Rules must use the corresponding actual slugs.
2. Generate credentials. Copy the API key and webhook signing secret into that app's SERVER secret settings. They are shown once. A rotation invalidates old values immediately.
3. Install adapters/serverAdapter.mjs on the app server. Inject a real verifySession(request) implementation using that app's existing authentication. It must verify session, tenant membership, role and CSRF/origin. It returns verified actor and org, replacing any browser-supplied identity. Set body-size/rate limits at the host endpoint.
4. Call adapters/members.mjs from authoritative membership changes. The /members/sync API accepts only the authenticated app's own memberships. Never expose this operation in the browser adapter. Send role remove on revocation; queue and retry failed sync operations. Verified app session checks must continue even if central membership is temporarily stale.
5. Add React BusinessServices, ReferralDashboard, LinkedServices and (optionally) the manual-record MyServices screen to the owner/manager dashboard. Use react/client.mjs with a stable API function. For accountants use ReferralDashboard provider=true, with org set to that accountant firm's ID.
6. Send subscription state from verified billing data using adapters/webhooks.mjs. Persist the event before sending, retry the same ID/body, and issue a fresh timestamp/signature on each delivery attempt. Use a monotonically increasing version per app/organisation. This current version models one qualifying subscription per organisation per app; aggregate multiple billing subscriptions into that authoritative status rather than sending independent counters.
7. Add a discount receiver to apps that offer discounts. discountReceiver verifies the signature and calls your supplied applyDurably callback. The callback must persist the event atomically, deduplicate id and reject/ignore older revisions. adapters/billing_inbox.py demonstrates the durable inbox pattern. A real billing worker must apply the latest desired discount through the app's existing processor, use an idempotency key, update the processing state and notify the customer. A 2xx webhook response means durably received, not discount applied.

## Exact discount behaviour
The setup creates haccora-eventplanr: source haccora, target eventplanr, 20%. Both must have status active, valid_until in the future, and verified linked accounts. Trials, past-due or cancelled subscriptions are ineligible. If access continues until period end after a cancellation request, the source app should keep status active and valid_until at the paid-through time, then send cancelled when access actually ends.

The target promo flag means another, non-ecosystem promotion. Do NOT set it true merely because this ecosystem discount was applied, or it would oscillate. A free trial should be reported as trial. Rules affect subscription fees only, never booking commissions, transactions or product orders. A discount change event uses effective=next_renewal. The receiving billing implementation must honour that timing and give clear customer notice, especially when a discount ends. The highest eligible percentage wins; discounts are not added together. Existing paid customers can link accounts and qualify on the same terms.

Eligibility does not create a new subscription, charge a card or upgrade a plan. For a customer who has not bought EventPlanr yet, they still explicitly choose a paid plan. The current eligibility workflow applies once both subscriptions are active; a pre-checkout discount preview/quote endpoint and first-invoice discount application are not included. Initial rollout therefore applies the linked discount at renewal, not retroactively.

## APIs
All browser-facing operations are proxied through the source app server, not called directly from the browser. Core operations use POST JSON with X-App and Authorization: Bearer APP_KEY; actor and org are inserted by the verified adapter.
- /catalogue — sector, country
- /referrals — referral {provider,service,brief,contact:{name,email},approved:true,notice:'introduction-v1',request_key}
- /inbox, /outgoing, /subscriptions — no additional fields
- /status — id,status (accepted/declined for provider; withdrawn for source)
- /link/start — destination app slug
- /link/finish — code
- /link/list, /link/remove — no additional fields
- /discount — current eligibility for this app/organisation
- /members/sync — SERVER ONLY {members:[{actor,org,role}]} with role owner/manager/staff/remove; no browser proxy access
- /webhooks/APP_SLUG — signed authoritative subscription event (see API-EXAMPLES.md)

The separate /admin/* endpoints use the administrator login and X-Ecosystem-Admin: 1. App API credentials cannot access central administration. The UI only displays aggregate referrals, provider records and delivery metadata; it does not expose one app's complete customer list to another.

## Validation and remaining integration work
36 Python tests and 4 Node tests passed, including HTTP auth/tenant checks, signed events, linked discounts, revocation, expiry, replay, ordering, credential rotation and durable receiver acknowledgement. A browser smoke script is included, but browser execution could not run here because the Chromium binary is unavailable. React screens and admin layout therefore still need browser verification in your environment.

Not deployed, not connected to live SaaS authentication/billing, and not certified as production secure. No live repo was modified. Real processor-specific billing changes, billing-success acknowledgements, customer notification delivery, production data-retention/deletion automation and infrastructure controls remain integration work. The package implements the central workflows and connector contracts without fabricating those external connections.
