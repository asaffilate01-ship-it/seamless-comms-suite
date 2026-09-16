# Enterprise AI local core

See the package START-HERE and integration guide before host integration.

`Registry(path)` stores use cases and audit records in SQLite. Every call receives a verified internal `Actor` with tenant, workspace, subject, permissions and expiry. It assumes the process and its database are trusted. The module itself does not authenticate users or discover permissions.

Supported operations: `create`, `revise`, `assess`, `attach_evidence`, `approve`, `begin_pilot`, `suspend`, `get`, `list_cases`, `audit`. Mutations require the current integer revision. Read and write scopes always include tenant and workspace. Assessment uses the fixed, explicitly versioned `enterprise-ai-pilot-v1` policy. No risk tier is accepted from the client.

Approvals require a human who is neither the declared owner nor any recorded contributor. They expire and bind to a hash of the specification, assessment and evidence references. Editing invalidates approval. The caller must resolve owner subject IDs; an arbitrary display name is not sufficient.

The evidence values are references only. An independent reviewer must inspect the underlying documents and test results. The code does not prove that a nonempty reference is truthful, accessible or sufficient. Production integration must snapshot evidence versions, record qualified domain reviews and check source permissions.

`begin_pilot` records a forecast check against an approved monthly budget in the same currency. The trusted host must recompute the forecast from a saved, approved scenario; it must not forward a browser-supplied integer. This does not reserve funds or stop a running agent. `suspend` changes register state only; the future runtime must consume revocations and enforce them before tools execute.

Audit writes are atomic with successful mutations. The local table contains actor, event, revision, time and record hash. It is not an immutable archive, has no retained historical record bodies and does not log every denial. A database owner can change it. External append-only retention, denial telemetry and historical versions remain required integration work.

`forecast` uses Decimal arithmetic, separate model rows, input and output rates, cached input, expected retries, fixed costs, tools, human review and contingency. All rates use one caller-specified currency. Price dates, exchange rates, tax treatment and provider-specific charges belong in the saved scenario. Returned currency amounts are rounded to two decimals; aggregate calculations occur before rounding. Costs are estimates, not billing reconciliation.

The library supports a single-process pilot. Back up the database and limit access to its file. It has not been load-tested or migrated to production Postgres. There is no HTTP listener, packaging installer, UI, scheduler or model connector.
