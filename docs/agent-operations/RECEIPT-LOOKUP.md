# Read-only queue receipt lookup

Stacked on PR #213. An unresolved queue request now displays its UUID reference.
Users can save it manually before leaving and paste it into **Find an earlier
queue request** after reloading. Lookup reads an existing reservation and linked
run; it never replays a request, reserves money, cancels work or releases funds.
The original request payload remains memory-only. This is manual reference-based
recovery, not automatic cross-session retry or persistent storage of task goals.

The endpoint requires current actual tenant membership through the authenticated
client and existing RLS. Both reservation and run are constrained by tenant and
product. A non-admin must be the run's initiating user; actual tenant owners and
admins can inspect their tenant's tasks. A valid reference is not a credential.
No platform-admin membership bypass is introduced. Return values contain run ID,
recorded status/timestamps and reservation/actual minor units, excluding goal,
provider receipt details, initiator ID, raw input and model output.

A missing, inaccessible or mismatched record returns the same not-found shape.
Read errors are distinct failures. Neither result establishes that the original
request failed: it might still be in flight or inaccessible. No automatic clear
or retry follows a lookup. Returned status and costs are recorded database values,
not independently verified provider execution or invoices. The related records
are independently authorised reads, not a single transaction snapshot.

The input/result panel remounts on tenant/product changes. Request-specific query
keys avoid late-result replacement, inactive query caches expire immediately, and
refresh/error states hide old evidence. Changing the pasted reference hides the
previous result until a matching lookup completes.

Validation includes ten executable cases for scoped lookup, absent/revoked
membership, initiator/admin distinction, mismatched linked runs, failure redaction,
invalid IDs, zero and unsafe amounts, and reference lifecycle. Existing eight
queue-controller regressions and Factory checks remain applicable. No migration
or additional dependency is required. Hosted and signed-in browser testing remain
outstanding, including saved-reference lookup after reload and membership loss.

## Recorded execution evidence

The receipt view now includes the first 64 recorded agent steps and five newest
linked worker jobs, with explicit truncation flags. Worker metadata includes
status, recorded attempt count and start/completion/update times. A refresh action
rechecks membership and task access before fetching fresh evidence. A queued job
is not proof of a connected worker, and processing status is not a heartbeat.

Child reads happen only after authorising the exact parent run and its initiator.
Steps constrain tenant/run; jobs additionally constrain product and the exact
`ai_agent_run` subject type/ID. Raw input, results, error strings, worker key IDs,
tool arguments and source references are never selected. Child failures fail the
lookup rather than reporting an empty history. The endpoint remains read-only;
it does not retry jobs, mutate status, reserve budget or call an AI provider.

Five additional executable tests cover child isolation/redaction, parent denial,
deterministic ordering/truncation, child-query failures and empty histories. These
are source-level query tests. A local Playwright smoke test using synthetic backend
fixtures also passed mobile/desktop overflow checks, zero-cost rendering, refresh
failure hiding stale evidence, and the missing-receipt state without browser errors.
Hosted permissions and signed-in mobile/keyboard acceptance remain required.
This extension is stacked on PR #214.

## Saving references

Unconfirmed queue requests and found receipts offer Copy request reference and
Download reference. Copy writes only the UUID; a rejected/unavailable clipboard
shows manual-selection/download guidance. The text download contains the request
UUID, workspace ID, product and lookup instructions, without task payloads,
credentials, costs or worker evidence. Saving is explicit and does not write to
browser storage, submit work or establish that admission succeeded. Lookup still
requires current authenticated access. Download feedback reports a request to the
browser, not proof that the user retained the file.

A local Playwright fixture check exercised successful exact-UUID copying,
clipboard rejection and the real downloaded file contents, alongside the mobile,
desktop, lookup-failure and missing-receipt checks. TypeScript, build, all 36
focused regressions and 41 disposable PostgreSQL checks are required. Hosted
signed-in acceptance remains outstanding. This increment is stacked on PR #215.

## Importing saved references

The lookup panel can read the downloaded text file locally (8 KB maximum). The
parser requires the Omniqora header and exactly one valid request/workspace/product
field, and rejects a different current workspace or product. Imported identifiers
are untrusted lookup coordinates, never authorisation. No file contents are sent
to the server; only the normal scoped lookup runs after the user chooses Find
receipt. Failed imports clear earlier selection/evidence. A newer file selection
or manual reference edit supersedes an in-flight file read. Manual lookup now
requires a valid UUID rather than any 36 characters.

Four parser tests cover supported line endings/BOM, scope mismatch, duplicate and
invalid identifiers, file size and unrelated content. Local fixture browser checks
passed actual download-to-import recovery, explicit lookup and foreign-product
rejection. All 40 focused tests and 41 disposable database checks passed, alongside
typecheck and build. Hosted signed-in acceptance is still outstanding. Stacked on
PR #216; no schema, permissions, retry or provider behaviour changes.

## Clearing the lookup

Clear lookup removes the current reference, result and import feedback and returns
keyboard focus to the reference input. It invalidates pending file reads and
starts a new query generation so late lookup responses cannot restore the cleared
view or satisfy a subsequent lookup. This is a local display reset: it does not
cancel server work, erase audit records or delete downloaded reference files.

Local synthetic browser checks exercise clearing a visible receipt, clearing
while a lookup or file read is pending, keyboard focus and a fresh lookup after
reset. Hosted acceptance remains outstanding. Stacked on PR #217.
