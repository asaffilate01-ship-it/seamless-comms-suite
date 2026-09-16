# Veyumo integration v1

This adds the same mobile-account panel to Craftvaro, Haccora, Omniqora, Zoryn Pay and Zoryn Rewards. Omniqora owns the mobile account database and Gigs integration. The existing app subscription and payment flows remain separate.

## What works after deployment and configuration

- Verified local sign-in → server-signed Omniqora request; browsers cannot supply an account, country, eligibility, checkout URL or provider price.
- Create a mobile account, or explicitly connect an existing account with a single-use, ten-minute code. Linking grants **owner access to all lines and mobile billing**. Use only trusted owner workspaces. Email alone never links accounts. Already-created accounts are not silently merged.
- Haccora uses its existing `get_my_context` owner check and organization ID. Other apps use the verified signed-in user ID. Veyumo's private preview uses its authenticated ChatGPT user ID. This does not grant access to unrelated Omniqora tenants, Zoryn merchants or employee accounts.
- UK/GB default; DE must be explicitly configured and have approved offers. Country is a server setting, not inferred from the browser. This first version uses one market per app deployment.
- Approved offers only; Gigs Connect handles checkout and subscription management. An authenticated return is not proof of purchase; Refresh and signed Gigs events retrieve the current subscription state.
- Signed, durable Gigs event inbox; retry worker; idempotent outgoing subscription observations for linked Zoryn Pay and Rewards users. These receivers do **not** post payment balances or reward credits. Mobile service activation is not settlement.

## Deploy in this order

1. Review and merge the additive changes. Apply the new migration to Omniqora; apply the receiver migration to Zoryn Pay and Rewards. No old migrations are edited. Follow each repository's quality and release gates.
2. Deploy `veyumo-api`, `veyumo-gigs-webhook`, `veyumo-worker` and `veyumo-bridge` from Omniqora. Deploy `veyumo-bridge` in every other app, and `veyumo-events` in Zoryn Pay and Rewards. Their new `verify_jwt = false` entries are intentional: the bridge validates the local user via Supabase Auth, while service endpoints verify HMAC/Svix or the worker bearer secret themselves. No endpoint is anonymous-by-design.
3. Set the server secrets below. Never use a `VITE_`, `NEXT_PUBLIC_` or browser variable for a bridge/provider secret. Generate independent random secrets of at least 32 characters per connection.
4. Configure Gigs webhook delivery to Omniqora's `/functions/v1/veyumo-gigs-webhook`, selecting subscription events and the API version validated in staging. Store that endpoint's Svix signing secret.
5. Schedule an authenticated POST to `/functions/v1/veyumo-worker` every minute using a secret-capable scheduler. Keep the worker key in the scheduler vault. The worker claims five jobs per queue with SKIP LOCKED; retry delay grows to one hour, maximum ten attempts. Monitor `dead` jobs and stale `processing` rows. After fixing a failed destination, service-role operators can reset the affected job to `pending`, attempts 0, next_attempt_at now(). Do not create another event ID to replay it.
6. Seed offers through a service-role/operator workflow with approved Gigs plan IDs, country, final recurring price in minor units, exact allowances/roaming/FUP in the description and HTTPS terms URL. Offers default disabled and no invented tariff is seeded. Confirm displayed price and Gigs checkout price match, including tax treatment. Only enable sales after this test.
7. Enable `VEYUMO_SALES_ENABLED=true` centrally. Keep bundles off until the commercial offer and the treatment of app cancellation are approved. Gigs has the final contract/payment confirmation; this code does not collect card details.

## Server configuration

Every Supabase project already needs `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

Every app's `veyumo-bridge`:

| Variable                 | Value                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `VEYUMO_API_URL`         | Omniqora Supabase HTTPS `/functions/v1/veyumo-api` endpoint                          |
| `VEYUMO_BRIDGE_SECRET`   | Unique secret for this source, matching the central secret below                     |
| `VEYUMO_ALLOWED_ORIGINS` | Comma-separated exact HTTPS app origins; include approved staging origins explicitly |
| `VEYUMO_MARKET`          | `GB` initially; `DE` only after local launch approval                                |
| `STRIPE_SECRET_KEY`      | Existing live Stripe key in Haccora/Craftvaro only, for eligibility verification     |

Omniqora central secrets:

- `VEYUMO_SECRET_CRAFTVARO`, `VEYUMO_SECRET_HACCORA`, `VEYUMO_SECRET_OMNIQORA`, `VEYUMO_SECRET_ZORYN_PAY`, `VEYUMO_SECRET_ZORYN_REWARDS`, `VEYUMO_SECRET_VEYUMO`: independent per-source bridge keys.
- `VEYUMO_RETURN_CRAFTVARO`, `VEYUMO_RETURN_HACCORA`, `VEYUMO_RETURN_OMNIQORA`, `VEYUMO_RETURN_ZORYN_PAY`, `VEYUMO_RETURN_ZORYN_REWARDS`, `VEYUMO_RETURN_VEYUMO`: exact HTTPS return pages. Configure the existing page containing the panel, never an input from the browser.
- `GIGS_TOKEN`, `GIGS_PROJECT`, `GIGS_WEBHOOK_SECRET`.
- `GIGS_CONNECT_ORIGINS`: exact approved Connect URL origins, comma-separated; default `https://connect.gigs.com`. Set the actual Gigs-approved branded origin if applicable.
- `VEYUMO_SALES_ENABLED`: default off. `VEYUMO_BUNDLES_APPROVED`: default off.
- `VEYUMO_WORKER_SECRET`: independent scheduler bearer secret.
- `VEYUMO_EVENTS_ZORYN_PAY_URL`, `VEYUMO_EVENTS_ZORYN_REWARDS_URL`: destination HTTPS `/functions/v1/veyumo-events` endpoints.
- `VEYUMO_EVENTS_ZORYN_PAY_SECRET`, `VEYUMO_EVENTS_ZORYN_REWARDS_SECRET`: independent outgoing event keys, each matching `VEYUMO_EVENTS_SECRET` in the corresponding receiving project.

Source constants are `craftvaro`, `haccora`, `omniqora`, `zoryn_pay`, `zoryn_rewards`, `veyumo`. A shared secret authenticates one source only.

Veyumo Sites server uses `VEYUMO_API_URL`, `VEYUMO_BRIDGE_SECRET` (matching `VEYUMO_SECRET_VEYUMO`) and `VEYUMO_MARKET`. Its existing owner-private authentication remains in place. Public customer onboarding requires a separate approved authentication launch.

## Eligibility and commercial boundaries

Haccora verifies the Stripe subscription's organization metadata and customer mapping; Craftvaro verifies the live Stripe customer email against the authenticated verified email. Only active live subscriptions qualify; trial, failed lookup, test mode and past-due subscriptions do not. Signed eligibility expires within five minutes. Linked owner accounts can use a fresh eligible assertion from either app. Visit that app to refresh an expired assertion. Ongoing mobile discounts are not automatically repriced if an app subscription ends. Keep `VEYUMO_BUNDLES_APPROVED` off until an agreed product model covers that lifecycle. There is no cross-app Stripe webhook rewrite in this release.

There is no wallet debit, external Zoryn payment collection, automatic point award, pooled data, employee SIM assignment, number-port automation, physical SIM fulfilment, broadband or VoIP provisioning in this release. Gigs-hosted flows expose only capabilities enabled for the contracted project/plans. Add those capabilities after supplier and billing contracts are known. No bank/provider settlement capability is implied by an existing demo integration.

## Operational notes

- Gigs user creation is protected by a durable per-account reservation. If the request fails after Gigs creates the user, the next checkout fails closed with `mobile_account_setup_pending`. An operator must locate the Gigs user by the exact `metadata.veyumoAccountId`, verify the project and ownership, and add its ID to `veyumo_gigs_users` with subject_key `owner`. If Gigs confirms no user was created, the reservation may be removed to retry. Never recover by email alone or blindly delete a reservation after a timeout.
- A Gigs user belongs to one Veyumo account and is never reused for another account. All linked owners explicitly share that mobile account's hosted management access.
- Subscription lists request all documented states, including ended and restricted, and follow `moreItemsAfter`. Snapshot writes ignore older observations. Current Gigs state is fetched rather than trusting webhook ordering.
- Durable event IDs deduplicate retries without resetting processed state. Outgoing events contain only account/subject/subscription identifiers and status. Receivers store immutable observations, not a mutable financial balance. Events before a Zoryn account is linked are not backfilled automatically; future subscription events are delivered.
- Configure gateway rate limits before public rollout. Database tables are service-only with RLS; there are no browser-readable secrets or broad tenant grants. Application logs should exclude request bodies, connection codes and hosted-session URLs. The worker prunes request nonces older than one day. Set retention/cleanup for expired link tokens, processed events and audit records according to your data policy.
- Run staging end-to-end checks for two independent customers, expired/reused codes, cross-country refusal, eligibility expiry, checkout return, cancellation/restriction, duplicate and out-of-order events, provider timeout recovery and unavailable destinations. No live Gigs call is verified without project credentials.

## Automated checks

`node --test supabase/functions/_shared/veyumo/protocol.test.mjs`

The control-plane SQL and snapshot/link/dedup behaviour are tested with an isolated PostgreSQL-compatible PGlite database in `scripts/veyumo-database.test.mjs` (Omniqora only). Install `@electric-sql/pglite@0.3.14` in a temporary test environment and expose it through `VEYUMO_PGLITE_MODULE`, or add it to your normal development test setup. Production does not depend on it.

## Provider references

- https://developers.gigs.com/docs/connect/connect-sessions/creating-connect-sessions
- https://developers.gigs.com/api/latest/connect/connect-sessions
- https://developers.gigs.com/api/latest/core/users
- https://developers.gigs.com/api/latest/core/subscriptions
- https://developers.gigs.com/docs/core/events/events-webhooks
