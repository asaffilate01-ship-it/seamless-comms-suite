# FormationGenie activation contract

FormationGenie was already registered by `20261001171000_omniqora_saas_factory.sql`, with `formationgenie.secretarial` and the `company-formation-uk` blueprint. The October 5 extension adds explicit business/practice blueprints, rollout metadata and optional service associations, including the secretarial service as an optional Omniqora Accounts add-on. This association does not map accounting clients or install a receiver. Catalogue presence does not establish a live integration.

## Hierarchy

Omniqora platform operator → organisation → tenant → linked FormationGenie workspace → company records → assigned client approval packets. A practice is normally one tenant and one practice workspace; its client companies are domain records, not automatically tenants. A direct business customer receives its own business workspace/tenant binding. Separate legal companies can exist inside a business workspace, but access should match who is authorised to see the whole portfolio.

FormationGenie remains independently deployable. Its company-secretarial records, private documents, identity evidence, client approval revisions and filing receipts remain authoritative there. Shared ownership of two applications is not authority to read both tenants.

## Manual activation

1. Deploy the FormationGenie corporate, client approval and assistant-budget migrations plus updated frontend and functions from FormationGenie PR #1.
2. Create the correct FormationGenie business or practice workspace. Copy its workspace UUID; do not substitute a company number, company UUID or user UUID.
3. Create/select the Omniqora tenant using the corresponding blueprint. Keep provisioning pending until the actual source workspace is verified. This migration does not auto-provision or activate any tenant.
4. Link a `formationgenie` product connection with that external workspace UUID. Issue its `oqcp_...` credential using the existing control-plane workflow.
5. Configure `OMNIQORA_BASE_URL` and `OMNIQORA_CONNECTIONS_JSON` in the FormationGenie function environment. Each entry supplies `{workspaceId, tenantId, tokenEnv}`, where tokenEnv starts `FG_OQ_`. Put the actual credential in that named server secret. Never put it in VITE variables or a client-accessible table.
6. An owner/manager opens Corporate → Intelligence → Check tenant connection. The source calls `/api/control-plane/tenant-snapshot` using the configured credential and validates schema v4, both workspace identifiers, product key, tenant/product activation, generation time and entitlement validity dates.
7. Record a staging check for the correct tenant, an incorrect binding, a revoked credential and an inactive tenant. A valid handshake is evidence of the binding only. Other services remain unconnected until their respective adapters and deployment checks succeed.

Snapshots expire after at most five minutes and earlier at a relevant entitlement end. Future starts, malformed dates, perpetual trials, disabled services and inactive tenants/products are rejected or disabled at the source. Branding and arbitrary entitlement config are not exposed by the source's status projection.

The existing receiver marks a product connection connected when serving its snapshot; its connection state alone must not be interpreted as completed product provisioning. FormationGenie independently requires active tenant/product state before reporting enabled entitlements.

## Remaining integration work

- Omniqora intelligence: the source's new briefing is aggregate-only Lovable chat, not an Omniqora workflow. No runtime bridge, RAG corpus, GraphRAG ingestion, autonomous agent, budget contract or write callback is activated here.
- Communications: existing source reminder events need a consent-aware receiving consumer, recipient mapping, deduplication, retries and provider delivery receipts. No messages are sent by these changes.
- Accounting: PracticeCraft has separate secretarial tables and partial XML filing code. Agree a filing owner and map its practice/client IDs to FormationGenie workspace/company UUIDs before syncing. Do not run both as independent filing submitters for the same action.
- Billing, white-label domains, branding, SSO and automatic workspace provisioning are not implemented by this catalogue extension. No commercial prices are invented.
- Real Companies House submission and identity verification require their own provider acceptance tests; a catalogue capability or local reference is not proof of either.

The optional service associations default off for new installations. Existing associations retain their activation settings. There are no tenant data changes, automatic grants, messages or provider calls in this migration.
