# Omniqora CRM sales workspace

This extends the existing `/app/crm` Pipeline tab in the shared Factory repository. It does not create another CRM or migrate product databases. `/app/sales` remains the separate existing sales-engagement/sequence workspace.

## Included

- Active pipeline selector, title search and open/won/lost/cancelled filters.
- Deal cards with drag-and-drop and labelled native-select stage changes for keyboard/touch use.
- New deals with contact, currency, value and expected-close date.
- Dated follow-up creation using existing CRM tasks and next/overdue follow-up on cards.
- Open and probability-weighted values grouped by currency. Unspecified currencies are never treated as GBP.
- Tenant-scoped authenticated stage RPC with existing RLS, CRM entitlement, row locking, expected-version checks and atomic activity receipts. Closed stages set outcome/probability; moving back to an open stage reopens the deal. Other deal fields are preserved.
- Existing opportunity/task server functions verify linked records for the board's contact/company/follow-up writes.

## Activation and acceptance

Apply `20261024190104_crm_sales_stage_transition.sql` through the repository's normal reviewed migration process before releasing the new UI. The function is invoker-security; it grants no broader table access. Existing entitled tenant writers can move deals; viewers cannot. Missing migration or denied access produces an error, with no optimistic move claimed.

Verify with an authorised staging tenant: create GBP/EUR deals, select each pipeline, search/filter, move by mouse and keyboard, mark won/lost/reopen, schedule a follow-up, refresh, and confirm persistence. Use two sessions to verify that a stale edit is rejected. Confirm viewers cannot mutate through direct RPC calls, and a different tenant cannot read/move deals.

## Limits and remaining work

- Existing list APIs load at most 500 recent deals/tasks. Forecasts are explicitly labelled as covering loaded records, not tenant-wide financial reporting. Server pagination/aggregates are future work.
- Pipeline selection uses existing active pipelines. Creating/editing custom pipelines, deal detail editing, assignment controls and duplicate management are not added here.
- Follow-ups are stored tasks, not delivered emails/WhatsApp messages or an automation scheduler. The next dated deal follow-up can be completed from its deal card. General task editing/completion remains outside this board.
- No standalone billing/checkout, external product connector, provider activation, AI scoring or production deployment is part of this change.
- Existing wider CRM write endpoints retain their earlier audit behavior; the new stage RPC alone guarantees atomic stage/receipt writes.

## Local verification

`npm run typecheck`, `npm run build`, `npm run test:security`, `node verification/control-plane/crm-customer360.test.mjs`, `node verification/control-plane/crm-product-sync.test.mjs`, and `node --test verification/control-plane/crm-sales-model.test.mjs`.

The PostgreSQL tests apply the migration chain to disposable PGlite and exercise outcomes, reopening, unchanged metadata, stale versions, wrong pipeline/tenant, viewer/outsider denial, entitlement denial, no-op receipts and rollback on activity failure. Hosted/browser acceptance remains outstanding.

The base branch has an existing npm lockfile mismatch: package.json requests `@lovable.dev/vite-tanstack-config` 2.26.5 while package-lock.json records 2.25.3. Local verification used `npm install --ignore-scripts --no-package-lock`; this change does not modify the shared lockfile or the separate pending lockfile-repair work.

## Phase 2: lead conversion and follow-up completion

The Leads tab now offers a conversion dialog for new/working/qualified leads. Staff choose an active open stage and optional value/currency. A transactional RPC locks the lead, checks its version and tenant-linked person/company, creates the deal, marks the lead converted, and records one activity. It preserves contact, company, owner and source product; it keeps the source lead ID in deal metadata without copying the source external reference into another entity's namespace. Repeated conversion calls return the linked deal without creating another deal or receipt.

Deal cards can complete their next dated follow-up. A tenant-scoped RPC checks task version, related deal and active status, and saves completion plus its activity together. Completed retries are no-ops; cancelled tasks are not silently reopened. The activity links to the deal and its customer, making completion visible in Customer 360. Both RPCs use invoker security and existing RLS and require a CRM entitlement and writer role.

Apply `20261024190920_crm_lead_conversion_followup_completion.sql` after the stage-transition migration. No live migration has been applied by this work. The database suite also covers repeat conversion/completion, invalid values/stages, stale versions, cancelled/unqualified records, cross-tenant IDs, viewers, missing entitlements, and rollback if audit insertion fails. The UI prevents duplicate submissions while requests are pending.

Staging acceptance: convert one lead and retry from an old browser session; verify only one linked deal exists. Schedule and complete its follow-up; confirm it leaves the open follow-up list and appears in the customer's activity history. Validate read-only users and keyboard navigation through the conversion dialog. Hosted/browser acceptance remains outstanding.
