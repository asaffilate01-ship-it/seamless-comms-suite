# Agent Factory queue receipt recovery

A failed HTTP response does not establish that admission failed. Previously each
click generated a new idempotency key, which could create another paid task when
the first request committed but its response was lost.

The Factory now retains one unresolved payload and UUID per tenant/product in
component memory. A synchronous in-flight guard blocks duplicate clicks before
React rerenders. Retry sends the original task, provider, token ceilings and UUID;
server membership, approval and admission checks still apply. Changed form values
cannot silently replace an unresolved request. A successful receipt clears the
attempt so a subsequent deliberate submission can create a new task.

A failed post-admission workspace refresh is reported separately from a failed
admission. It must not invite the user to queue again for a refresh. A recovered
existing task is not labelled as newly queued; its current status must be checked.

Explicit two-step discard is available after the user checks run history. It only
removes local recovery information: it never cancels a server job, releases funds,
or establishes that admission failed. Discarding and resubmitting can create a
second task if one already exists, as disclosed in the UI.

Recovery survives tenant/product switching within the mounted Factory component.
It does not survive reload, navigation that unmounts the component, closing the tab
or opening another tab. The UI directs users to inspect run history in these cases.
No sensitive goal is written to localStorage, sessionStorage or a new database.
Durable cross-session admission recovery remains future work.

Verification: eight executable controller tests cover lost acknowledgements,
concurrent clicks, changed payloads, scope separation, mutation resistance,
repeated errors, new intentional requests and explicit discard. Existing Factory
contract tests, TypeScript, build and database security checks also apply. These
controller tests simulate a server commit/lost response; they are not a live
provider or hosted database test. Signed-in browser acceptance remains required.

This independent PR changes admission handling, while PR #212 adds run inspection.
Neither installs an agent framework, runs a model or deploys a service.
