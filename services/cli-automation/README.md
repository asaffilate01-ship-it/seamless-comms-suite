# CLI-Anything shared document pilot

A server-side pilot for every product in Omniqora's existing Factory registry. It accepts bounded plain-text document content, executes the reviewed CLI-Anything Writer commands, and stores a draft ODT with a checksum. It does not generate facts, approve compliance, issue certificates, publish content or operate payments.

**Status: tested source, not connected or deployed.** Product registry coverage is capability discovery, not runtime authorisation. No individual product repository, tenant, credential, production database or frontend is changed. Cafe 1 and DispatchDeck are not separate identities in the current Factory registry; do not silently map them to another product.

## Implemented

- One shared `document.draft` capability for all 88 current registry identities; future registry identities remain denied unless the host authoriser explicitly grants them.
- Trusted server scope includes tenant, product and actor. Every submission, execution, status read, download and deletion calls a mandatory live authoriser; execution rechecks authorisation before releasing output.
- Private SQLite pilot store, atomic daily per-tenant/product request allowance, durable request deduplication, payload conflict rejection, atomic execution claim and state/audit transitions. Failed/deleted jobs consume their original allowance. No automatic retry of running or failed jobs.
- Fixed commands, no shell, no user paths, bounded text, clean child environment, five-second timeout per command (at most 24 commands), private temporary work directories and bounded ODT archive validation. No external document imports, embedded files, macros, formulas or URLs are processed.
- Plain text is cleared from the job on success/failure. Outputs are accessible only through current same-tenant/product/actor authorisation. Delete clears payload/output, retains the request tombstone and audit. Database/backups still require a real retention policy.
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

No HTTP endpoint, queue daemon, source data adapter, model call, scheduler, billing processor or automatic production deployment is included. Never expose this library directly to untrusted callers.

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

Before rollout: implement each product's server adapter and UI; run two-tenant authenticated staging acceptance; test output visually in office software; verify accessibility/localisation, regional storage and retention; configure isolated worker infrastructure, entitlements and operational monitoring. Single-host SQLite is a pilot implementation, not a fleet-wide queue. Crashed `running` jobs require operator reconciliation (no automatic reclaim), and quota is request-count based, not cost billing. Deletion is logical; backups, temporary storage and physical erasure must follow the host retention policy. Media editing, rendering, brand assets and external software access remain separate reviewed adapters.
