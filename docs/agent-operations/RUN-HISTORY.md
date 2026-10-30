# Agent operations: persisted run inspection

The Agent Factory now lists database-backed run metadata, 20 records per page,
ordered by creation time and ID. Select a run to inspect its recorded step
sequence and refresh explicitly. This works after a page reload; it does not rely
on the most recently queued run ID held in component memory.

The panel describes queued/running/review/completed/failed/cancelled/stale states
without equating recorded status with independently verified execution or output
accuracy. No retry button creates a second paid job. Failed/stale work directs
operators to inspect the worker and usage records before restarting.

## Access and data boundaries

Every request uses the authenticated Supabase client and existing RLS. Current
actual tenant membership is checked before reading history. Detail and cancellation
recheck the exact tenant/product/run before reading child steps or reservations.
This panel grants no platform-admin membership bypass. Step reads return only
sequence, type, status and timestamp, excluding raw prompts, responses, tool
arguments, source URLs, provider credentials and results.

History uses a 21st sentinel row; detail caps steps at 64 and exposes truncation.
Offset pages may shift when runs are inserted. Errors hide old data; they do not
become empty success. Query keys include tenant/product/run/page and the Factory
operations refresh version. Cached inactive data expires immediately. The panel
remounts on tenant/product changes so selection and confirmation cannot follow
users into another workspace. These are independently authorised reads rather
than a transactional snapshot of every table.

## Cancellation

Only queued runs with a reserved budget and no recorded steps offer cancellation,
and only to their initiating user or an actual tenant owner/admin. Confirmation
calls the existing `cancel_budgeted_ai_agent` RPC, which locks and rechecks the
run, reservation, worker job and budget. A worker race is rejected by that RPC.
There is no fallback to the legacy direct-update cancellation route. UI checks
are advisory; database checks remain authoritative. No retry or worker-side stop
is implemented here.

## Verification and release

- `node --test verification/agent-operations/*.test.mjs`
- `npm run typecheck`
- `npm run build`
- `npm run test:security`
- Existing Agent Factory and budget contract regressions.

The npm lockfile now matches the already-declared Lovable Vite configuration
version 2.26.5 and the existing Bun lockfile. No new runtime dependency, schema,
provider, paid call, MCP connection or deployment is introduced.

Before hosted release, test with two signed-in tenants: switch while loading,
refresh after membership revocation, inspect an inaccessible run, page through
more than 20 tasks, cancel before processing, and race cancellation against a
worker claim. Check mobile/keyboard operation and the confirmation controls.
Signed-in browser acceptance and live worker verification remain outstanding.

## Next integration sequence

1. Verify the current worker and settlement path against one authorised pilot.
2. Add outcome evidence and evaluation tracing to that path.
3. Evaluate Mastra versus the existing orchestration implementation with a bounded
   proof of concept; avoid deploying a second overlapping runtime by default.
4. Connect approved GitHub/browser evidence adapters to Review Lab, respecting the
   existing pending research-persistence PR rather than adding competing tables.
5. Expand the interface with an assistant and visual workflow authoring after
   runtime and permission contracts have been verified.
