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
- Pipeline selection uses existing active pipelines. Creating/editing custom pipelines, lead conversion, deal detail editing, assignment controls and duplicate management are not added here.
- Follow-ups are stored tasks, not delivered emails/WhatsApp messages or an automation scheduler. Completing tasks remains outside this board.
- No standalone billing/checkout, external product connector, provider activation, AI scoring or production deployment is part of this change.
- Existing wider CRM write endpoints retain their earlier audit behavior; the new stage RPC alone guarantees atomic stage/receipt writes.

## Local verification

`npm run typecheck`, `npm run build`, `npm run test:security`, `node verification/control-plane/crm-customer360.test.mjs`, `node verification/control-plane/crm-product-sync.test.mjs`, and `node --test verification/control-plane/crm-sales-model.test.mjs`.

The PostgreSQL tests apply the migration chain to disposable PGlite and exercise outcomes, reopening, unchanged metadata, stale versions, wrong pipeline/tenant, viewer/outsider denial, entitlement denial, no-op receipts and rollback on activity failure. Hosted/browser acceptance remains outstanding.

The base branch has an existing npm lockfile mismatch: package.json requests `@lovable.dev/vite-tanstack-config` 2.26.5 while package-lock.json records 2.25.3. Local verification used `npm install --ignore-scripts --no-package-lock`; this change does not modify the shared lockfile or the separate pending lockfile-repair work.
