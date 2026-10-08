# Growth workspace setup and product connections

## Release status — 2026-10-08

| Application | Released source | Deployment |
| ----------- | --------------- | ---------- |
| Omniqora | [PR #83](https://github.com/asaffilate01-ship-it/seamless-comms-suite/pull/83) merged as `5c7ffdee3462e69b64bf790d329588be2fe4a6d2`; application release tree `b2b70e20ba1b049796db3f3fd97180ca078ccaf6` | Published through Lovable to [omniqora.itechlounge.co.uk](https://omniqora.itechlounge.co.uk) |
| Merqora | [PR #1](https://github.com/asaffilate01-ship-it/daraz-amazon-hub/pull/1) merged as `2a5c3135f905025fc2f74721c121989b44e5a426` | Published through Lovable to [daraz-amazon-hub.lovable.app](https://daraz-amazon-hub.lovable.app) |
| Affivon | Version 9, source `54305f7ca795472a221711e37686fcd31cd10fd8` | Deployment succeeded on the existing Site |

Both additive migrations listed below were applied. The hosted database postflight verified canonical migration source, permissions and record-count invariants at `2026-10-08T19:13:13.228324+00:00`.

At release verification, actual provider/service credentials, remote mappings, platform-administrator assignments and tenant/product/service activations remained absent. The hosted Syndriva commerce catalogue also remained absent. A real-model end-to-end run has not been performed.

## Scope

This build adds a workspace selector, a working setup request/review flow, writer configuration and product adapters to the existing Growth studio. It retains the studio's brand, evidence, generation, human approval and draft handoff behavior. Installation does not activate a tenant, create a platform administrator, create a service credential or make a provider request.

| Product  | Authoritative application                                                       | Added behavior                                                                                                                                    |
| -------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Omniqora | `asaffilate01-ship-it/seamless-comms-suite`, existing Lovable deployment        | Paginated workspace selection; setup requests and decisions; service and writer readiness; editable writer configuration; copyable run references |
| Syndriva | Native commerce modules in the Omniqora repository                              | Import eligible active catalogue records into the selected Growth brand, with source change and expiry checks                                     |
| Merqora  | `asaffilate01-ship-it/daraz-amazon-hub`, existing Lovable deployment            | Authenticated Growth panel and server adapter to retrieve approved, current output for an operator-mapped user and brand                          |
| Affivon  | Existing Affiliate Commerce OS Site, `appgprj_6a8764d73fa481918fa0ba58fc098d2d` | Store-scoped offer evidence and approved-output integration, using saved eligibility checks and disclosure                                        |

Merqora is distinct from Merqano (`commerce-compass`). The build does not migrate any application's hosting. Merqora's AI research estimates are not imported as verified catalogue facts.

## Workspace setup

Open `/app/growth`, choose an accessible workspace, then choose the product. Switching workspace clears unsaved setup and campaign forms. Workspace options are read from current membership or existing platform-administrator authority, with pagination; there is no first-membership-only restriction.

The **Workspace setup** panel shows product and Campaigns access, writer readiness and Creative handoff access. Owners and tenant administrators can submit a request for Campaigns and optionally Creative. Requests retain their requested dependency plan, note, revision and decision history. A repeated request key returns the original request; one pending request per tenant/product prevents duplicated activation work.

Only an already-authorized platform administrator can approve or decline. Approval recomputes the service dependency closure and rejects a changed plan, checks the current product connection, and refuses suspended, cancelled, expired, future-dated or billing-pending access. Existing valid service end dates are preserved. New product activation records use `status='active'` with `launch_status='configuring'`: service access and operational readiness remain distinct. Installation does not bootstrap a platform administrator. If none exists, the UI explains that review is unavailable.

Remote product activation needs a previously verified product connection. Selecting a product label or committing an adapter does not mark its deployed application connected. Already active products retain access subject to their existing service validity and tenant state.

Writer configuration accepts a supported provider, an explicit model ID and an output limit of 512–4,096 tokens. It writes the exact tenant/product binding and derives the permitted secret reference. Actual provider secret values must be installed through the existing application's server secret store. The UI accepts no secret value and there is no global credential fallback. **Ready to request** describes local configuration; a successful live generation is required to establish provider acceptance.

Every read and mutation is checked again in SQL. Direct client writes to the setup-request table are denied. The database's `growth_studio_access` function now supplies the canonical access result to the server, including correct precedence for existing platform administrators. A hidden or disabled control is not the authorization boundary.

## Native Syndriva sources

With a saved Syndriva Growth brand and valid access, the evidence panel lists eligible active marketplace listings. Eligibility checks the listing, active vendor, tenant/product relationships and any linked brand/location. Tracked inventory must have a valid item, stock location and positive finite available stock. Private vendor metadata and payout/contact fields are excluded. No source URL is invented when the catalogue does not provide one; imported URLs are null.

An import stores a private link to the listing, a canonical fact snapshot, its SHA-256 fingerprint and the matching evidence revision. Evidence expires after 15 minutes. Repeating an unchanged, unexpired import returns the existing revision. Refreshing after expiry or a source change revises the evidence and invalidates dependent output.

The catalogue is checked before a run can be inserted, before provider HTTP begins. A source change during generation makes the result stale. Completion, approval, handoff and approved export also recheck source currency. Editing the linked evidence manually breaks the recorded revision match and requires a fresh import. Deleting a listing or revoking access blocks further use.

The current hosted Growth database did not contain the commerce catalogue when this build was prepared. The migration deliberately supports that state: the UI reports that the native catalogue is unavailable. It does not install the unrelated commerce schema or seed invented catalogue records. A separate reviewed commerce rollout is needed to use this path on that deployment.

## Remote adapters

Both adapters use the same framework-neutral transport contract, vendored verbatim in their respective repositories. It posts only to the fixed production Omniqora Growth gateway over HTTPS. Service credentials remain server-side. Requests have a 10-second deadline and bounded request/response bodies; redirects, unexpected origins, scope mismatches, stale exports and invalid provenance are rejected. Provider error text is not passed through to users.

The receiving application resolves the user or store against an operator-owned mapping before making a request. Callers cannot supply another tenant, product or Growth brand. Configuration and mapping are checked again after a request to catch revocation while it is in flight. Each deployment still needs its actual mapping and appropriately scoped service credential configured by its administrator. See each adapter's operator guide for exact environment names and contracts.

In Omniqora, open an approved run and use **Copy run ID**. The corresponding product panel retrieves that ID under its saved mapping. Retrieval verifies the returned tenant/product/brand/run, completed state, human approval, input provenance, evidence expiry and export time. It does not publish an advertisement, send a message or create a live campaign in an external account.

Affivon's offer ingestion additionally uses the actual store/product/offer records, current market and connector state, an active affiliate account, a price check less than 24 hours old, a real future offer expiry and the saved disclosure. An empty or ineligible catalogue remains empty. Its authenticated approved-output path checks the saved disclosure and current source eligibility again.

Affivon labels retrieved content **Reviewed snapshot**. For locally linked affiliate offers it rereads the scoped source, checks eligibility, and compares the source URL and effective expiry with the exported provenance. Unlinked affiliate evidence is counted as unverified locally. The gateway does not export a full source-content fingerprint, so local price, affiliate-link or product-text changes that preserve the source URL and effective expiry can still require operator comparison. Review current retailer details before using the snapshot. Retrieval performs no implicit reingestion or other evidence writes.

## Migration and release order

Apply these additive migrations, in order, against the inspected target ledger before publishing the new Omniqora application:

1. `supabase/migrations/20261008183000_growth_setup_requests.sql`
2. `supabase/migrations/20261008183500_growth_syndriva_sources.sql`

The first migration adds a required RPC used by the new server access path. Publishing the application before that migration will cause workspace access checks to fail. Use the existing native Lovable Cloud deployment path with source-exact migration bodies and ledger records in the same transaction. Do not reset the database or insert migration-ledger entries without executing their SQL. Rehearse both the exact hosted dependency subset and the complete checked-in migration chain.

Publish each application through its existing host after its normal build and review gates. GitHub synchronization is separate from native Lovable publication. Preserve Affivon's existing audience. After publishing, verify the resulting revision and signed-out access boundaries; record authenticated end-to-end and provider acceptance only when they have actually been performed with the real configured workspace.

## Verification

`npm run test:growth` includes the original runtime, database and gateway checks plus the setup and native Syndriva database suites. The new suites exercise both the hosted subset and complete-repository schema profiles. They cover roles, cross-workspace isolation, request replay/conflict handling, dependency changes, service validity, provider secret scoping, native source eligibility, stock, expiry, deletion and stale-output prevention.

`verification/growth-ui` renders the actual pure setup view with clearly labelled sample data for owner, viewer, pending administrator and unavailable-review states. It is an isolated development fixture, not an application route or authentication bypass. A successful fixture build does not count as browser visual acceptance.

Required release checks remain the repository production build, typecheck, security checks, normal application CI and complete migration-chain rehearsal. The separate Merqora and Affivon suites exercise their own authentication/mapping rules and the shared gateway transport. Test fixtures do not prove live credentials or account connections.
