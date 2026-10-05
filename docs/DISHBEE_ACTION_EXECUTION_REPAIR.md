# Dishbee action execution: controlled release contract

The source merge does not enable execution. The unpublished initial action migration no longer expands existing or future connector capabilities. The shared platform_link_product function is left unchanged.

Activation requires all of: an active Dishbee product, a currently valid intelligence-runtime entitlement, a deliberate boolean tenant_products.config.actionExecutionEnabled setting, an explicitly granted action capability, an active per-tenant allowlisted tool binding with approval_mode=always, and human approval of the proposal. Approval cannot create or reactivate tool bindings. Location/brand-limited service credentials are refused by this product-wide execution contract rather than silently widened.

The new completion protocol requires actionRequestId, claimToken and workerKey. Claim tokens rotate on every attempt. Worker ownership is derived from the authenticated connector/service credential and the worker label. The database constrains completion to the same tenant, product, destination, binding, approved proposal and attempt. The old unscoped completion signature is removed. Exact repeated completion is accepted without another write; inconsistent or stale completion is rejected.

The downstream executor must persist actionRequestId as its idempotency key. A lease token prevents stale acknowledgement but cannot itself guarantee an external provider executes only once. Before enabling the feature, test receiver idempotency and loss of acknowledgement with real staged runtime adapters. Exhausted crashed attempts are marked for manual outcome reconciliation, never silently retried.

Review and queue are one transaction. A replay does not create a second request; a failed enqueue rolls back the review. Approved proposals whose tools have not been explicitly configured remain unqueued with an explicit reason. Foreign scope, revoked approval or changed payload/target/binding cannot finish an execution.

PR #75's accepted readiness implementation and migration history are preserved. The duplicate, never-merged #71 readiness correction with the same migration timestamp is removed from this unmerged branch; no published main migration is removed or rewritten.

Local execution tests: full checked-in PGlite migration chain plus 36 action scope/approval/lease/retry/idempotency checks, and eight actual gateway tests with mocked database boundaries. They do not replace native concurrency, hosted role, real worker, provider or production acceptance. Normal full CI and fresh Supabase replay must pass before merge.
