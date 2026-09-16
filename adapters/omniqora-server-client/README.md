# Omniqora server client — new consolidation addition

This dependency-free JavaScript module calls the API in the recovered Omniqora AI pilot. It does not install those API routes in the main Omniqora repository or connect a live SaaS. Use a server runtime with Fetch, private class fields and `AbortSignal.timeout` support.

Run the included contract tests with `node --test omniqora-client.test.mjs`. These use a fake HTTP transport; they do not prove a live deployment or tenant authorisation.

## Integrate in a SaaS backend

1. Authenticate the application user through the existing server session and check organisation membership, product permission and add-on entitlement.
2. Resolve a fixed service URL and a company/product-specific credential from server configuration. Never accept the service URL or credential from the browser, and never use frontend environment variables for the credential.
3. Call `queueRun({eventId, title, input})` with a durable source event ID, approved facts and an allowed purpose. The client deliberately sends no tenant selector; the service credential fixes that scope.
4. Store the returned run ID in your own database. A queued run is not a completed agent task. The recovered pilot requires an operator to process queued runs.
5. Poll `listApprovedTasks()` through a controlled worker and persist a unique mapping of source app, company, product and Omniqora task ID. The endpoint returns at most 50 oldest open tasks; mirror them durably and reconcile completion so later tasks can become visible. Do not execute the natural-language task body.
6. Call `acknowledgeCompletedTask(id)` only after the mapped internal task is durably completed by your application. Acknowledging receipt alone would incorrectly mark the work complete. Retain source receipts and a durable retry/reconciliation queue in the SaaS; this client does not supply a database or worker.

The client sends no automatic retries. After a timeout, retry an event only with the same ID and unchanged payload using your durable source queue. The recovered pilot namespaces event IDs by integration credential record; preserve that record when rotating its token. Replacing it with a new integration identity can lose run deduplication continuity, so reconcile before retrying across that change. This differs from reception request deduplication; do not assume the two have identical semantics.

The old private Site gateway may block machine calls before bearer authentication. Use a properly authenticated API deployment. Do not remove access controls to make the request work. See the Omniqora pack's original integration and merge guides before porting from D1/SQLite to Supabase/Postgres.

Lawquo's `prepare_assessment` request and private result callback still need their specialised connector. This generic run/task client does not implement that callback or legal approvals.
