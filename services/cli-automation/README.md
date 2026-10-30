# CLI-Anything shared document pilot

A server-side pilot for every product in Omniqora's existing Factory registry. It accepts bounded plain-text document content, executes the reviewed CLI-Anything Writer commands, and stores a draft ODT with a checksum. It does not generate facts, approve compliance, issue certificates, publish content or operate payments.

**Status: tested source, not connected or deployed.** Product registry coverage is capability discovery, not runtime authorisation. No individual product repository, tenant, credential, production database or frontend is changed. The HTTP adapter is framework-neutral and requires the host’s actual token verifier and permissions before mounting. Cafe 1 and DispatchDeck are not separate identities in the current Factory registry; do not silently map them to another product.

## Implemented

- One shared `document.draft` capability for all 88 current registry identities; future registry identities remain denied unless the host authoriser explicitly grants them.
- Trusted server scope includes tenant, product and actor. Every submission, execution, status read, download and deletion calls a mandatory live authoriser; execution rechecks authorisation before releasing output.
- Private SQLite pilot store, atomic daily per-tenant/product request allowance, durable request deduplication, payload conflict rejection, atomic execution claim and state/audit transitions. Failed/deleted jobs consume their original allowance. No automatic retry of running or failed jobs. Operator-authorised recovery marks stale running jobs interrupted and fences late results.
- Fixed commands, no shell, no user paths, bounded text, clean child environment, five-second timeout per command (at most 24 commands), private temporary work directories and bounded ODT archive validation. No external document imports, embedded files, macros, formulas or URLs are processed.
- Plain text is cleared from the job on success/failure. Outputs are accessible only through current same-tenant/product/actor authorisation. Delete clears payload/output, retains the request tombstone and audit, and is idempotent. Explicit scoped retention maintenance clears up to 100 old non-running payloads/outputs per pass. SQLite secure deletion is enabled; backups and storage snapshots remain the host’s responsibility. Database/backups still require a real retention policy.
- All generated documents visibly say DRAFT. ODT is supported and tested; PDF/DOCX require separate LibreOffice conversion testing and are not exposed.

## Source ownership and rollout

| Product | First application of the shared document capability | Additional work before users can use it |
|---|---|---|
| VOXENTRI / Creative Studio | Campaign briefs and production summaries | Product data adapter; preserve existing clip/render worker ownership; media editing is a separate capability |
| UniPathway, Ilmvero, SkillFinch, STEMCoach, LessonAhead, TrainDirekt | Teaching handouts and progress-report drafts | Existing course/student permission checks, approved input mapping, document review/download UI |
| Kindelo | Inspection preparation and provider-support drafts | Role/setting scope and document review; no safeguarding decisions or regulatory certification |
| Haccora | Evidence summaries and corrective-action drafts | Authorised evidence selection; compliance review remains in the product |
| Dishbee | Menu text and venue report drafts | Venue-scoped source data; no changes to orders, prices or allergens |
| Courier Connect / Courier OS, Fleetora | Dispatch summaries and delivery evidence drafts | Shipment and customer permissions; no route assignment or delivery-status mutation |
| MoneyBridge (`fastremit`), TaxNuvia, accountancy products | Operational/reporting drafts | Financial-data permissions; no transfers, ledger postings or financial recommendations |
| Remaining Factory products | Generic operational document drafts | Product-specific source validation, scope mapping, entitlement, UI and acceptance tests |
| Cafe 1 and DispatchDeck | Proposed attendance/pay and dispatch report drafts | Independently verify/register identities; no inferred alias or activation |

The registry is consumed read-only. Edition/region restrictions must be enforced by the host authoriser, not inferred from the product label. Existing Omniqora product bridges and customer identity remain authoritative. Do not reuse a landlord service role as user permission.

## Host integration contract

Import `Service` and `LibreOfficeHarness` from `automation.py` in a server process. Supply an operator-owned database path, an immutable reviewed executable, and an `authorise(scope, action)` function. The function must query current authenticated actor membership, product activation, tenant entitlement, operation permission and regional boundary; return exactly `True` to allow. There is deliberately no permissive production example or default authoriser.

1. Authenticate the user's existing product session; resolve tenant/product/actor on the server. Never pass identity fields straight from request JSON.
2. Read source records through the product's existing permissions and map approved facts to `{title, paragraphs}`. Source APIs, IDs and credentials never become CLI arguments.
3. Call `submit(server_scope, durable_source_event_id, payload)`. Persist the job ID in the source app. Identical retries reuse the ID; changed content needs a new request.
4. Call `run(server_scope, job_id)` in the single-host pilot worker with current permission checks. One process owns each `Service` connection. Separate worker processes can share the protected database on the same host.
5. Return `status` and serve `download` through the product's authenticated backend as an attachment with `application/vnd.oasis.opendocument.text`, `Cache-Control: private, no-store` and a fixed filename. Do not expose the SQLite file or a public filesystem URL.
6. Keep review/approval in the source app. `completed` means a draft file was generated, not approved or delivered to a recipient.

A framework-neutral HTTP adapter is included; no listener, token issuer/verifier implementation, queue daemon, source data adapter, model call, scheduler, billing processor or automatic production deployment is included. Never expose this library directly to untrusted callers.

## Upstream verification and reproducibility

Upstream: https://github.com/HKUDS/CLI-Anything

Tested commit: `34f519533bc175d2fe287ab8316b0dd99bb9cc43`.

Tested package: `libreoffice/agent-harness`, version 1.0.1. Commands were inspected in `cli_anything/libreoffice/libreoffice_cli.py`, not inferred from the marketing README. ODT is generated by the harness itself; the LibreOffice desktop application was not installed or tested.

Development setup (synthetic data only):

```sh
git clone https://github.com/HKUDS/CLI-Anything.git /tmp/cli-anything-reviewed
git -C /tmp/cli-anything-reviewed checkout 34f519533bc175d2fe287ab8316b0dd99bb9cc43
python3 -m venv /tmp/oq-cli-venv
/tmp/oq-cli-venv/bin/pip install -c services/cli-automation/test-constraints.txt /tmp/cli-anything-reviewed/libreoffice/agent-harness
CLI_ANYTHING_TEST_EXECUTABLE=/tmp/oq-cli-venv/bin/cli-anything-libreoffice python3 -m unittest discover -s services/cli-automation/tests -v
```

The reviewed commit argument is a deployment assertion, not cryptographic verification of installed files. Production needs a reviewed, immutable image pinned by digest, a complete dependency lock/SBOM, upstream/dependency licence review, non-root execution, no network, no host mounts, resource limits, encrypted storage/backups and a dedicated worker identity. The library is not an OS sandbox. Never install the generator, arbitrary plugins or agent hooks into a production worker.

## Verification and remaining release gates

Offline tests cover tenant/product/actor isolation, revocation before/during execution, idempotency conflicts, quotas, failed/duplicate claims, corrupt output, redacted errors, shell/environment isolation and contract execution across every current registry identity. The opt-in E2E invokes the real installed upstream CLI and checks ODT type, draft marking, content and escaped XML. Offline CI skips that E2E explicitly when the reviewed executable is not installed.

Before rollout: implement each product's server adapter and UI; run two-tenant authenticated staging acceptance; test output visually in office software; verify accessibility/localisation, regional storage and retention; configure isolated worker infrastructure, entitlements and operational monitoring. Single-host SQLite is a pilot implementation, not a fleet-wide queue. Crashed `running` jobs can be terminally reconciled after ten minutes with the separate `document.reconcile` permission (no automatic reclaim or retry), and quota is request-count based, not cost billing. Deletion is logical; backups, temporary storage and physical erasure must follow the host retention policy. Media editing, rendering, brand assets and external software access remain separate reviewed adapters.


## Phase 2: product API and job lifecycle

`ProductAPI(service=..., verify_bearer=...).handle(method, path, headers, body)` returns `(status, headers, bytes)`. Mount it through the product's existing TLS server with a 64 KB request-body cap, request/header timeouts and duplicate Authorization/Content-Length rejection. Pass lower-case headers. It accepts only Bearer authentication, never cookies or identity fields from the browser. `verify_bearer` must validate the actual source session/token and resolve its current tenant, product and actor on the server. It runs on every request; `Service.authorise` still checks current operation permissions. No permissive verifier is shipped. Use a service connection per thread/request; SQLite connections cannot be shared across request threads.

| Route | Behaviour |
|---|---|
| `POST /v1/documents` | `{requestId, document:{title, paragraphs}}`; return stable job ID; unchanged retry does not claim a new queued state |
| `GET /v1/documents?before=CURSOR&limit=25` | Scoped newest-first keyset job list with next cursor; no document content or foreign identities |
| `GET /v1/documents/JOB` | Current job state, draft marker and completed output checksum |
| `GET /v1/documents/JOB/history?after=CURSOR&limit=25` | Scoped audit events in chronological pages |
| `GET /v1/documents/JOB/artifact` | Authenticated ODT attachment with fixed filename, no-store and nosniff headers |
| `DELETE /v1/documents/JOB` | Idempotently clear non-running job content; retain deduplication tombstone |

No execution, reconciliation or retention route is exposed. Those remain trusted worker/operator operations, never commands selected by an AI or browser. Rate limits, real host auth, deployment and product UI remain integration requirements. Authentication failures are 401, denied operations are 403, invalid/state-conflicting requests are 400, oversized bodies are 413, unsupported content types are 415 and internal failures are a redacted 503. HTTP errors deliberately do not reveal database or verifier details. Unknown methods/routes return 405/404. No CORS permissions are granted.

`reconcile_interrupted(scope, job)` requires a current `document.reconcile` grant plus a running audit timestamp at least ten minutes old. It atomically closes the job, clears content and records an interrupted event. A still-running process cannot subsequently commit completion because finalisation now requires an active running claim. Operators should also stop the isolated worker before recovery. Recovery does not rerun work or return spent quota; a new approved request ID is required for a fresh job.

`expire(scope, days=7)` requires `document.retention`, accepts 1–90 days and clears at most 100 same-tenant/product/actor non-running jobs older than the date cutoff. It retains request digests and audit records to preserve retry identity. There is no automatic retention schedule, physical storage erasure guarantee or cross-tenant operator bypass. Running jobs must be reconciled separately. The host must schedule retention and its own audit/tombstone retention policy before production use.

Validation on 30 October 2026 adds API authentication/role boundaries, pagination across inserts, foreign-job denial, no exposed execution routes, request limits/error redaction, recovery permissions/age, late-result fencing, idempotent deletion and scoped retention tests. No real product JWT, deployed endpoint, browser session or customer data was used.

## Phase 3: HTTP mounting and JavaScript product integration

`wsgi_app.create_app` wraps the API in a mountable WSGI application with one service connection per request, guaranteed cleanup, bounded request framing and private length-delimited responses. No production listener is started. The actual host still supplies token verification, current permissions, TLS, rate limits and read timeouts. Duplicate header rejection belongs to the upstream HTTP server/proxy.

`adapters/cli-documents/client.mjs` supplies the server-side JavaScript client for submissions, paginated lists/history, status, downloads and deletion. It obtains fresh credentials per request, refuses redirects, bounds credential/network/body waits, validates response schemas, and checks downloaded bytes against the completed job's SHA-256. No automatic retries, polling, worker execution or tenant selectors are provided. See that adapter's README for deployment boundaries and the synthetic two-tenant real-HTTP acceptance test.
