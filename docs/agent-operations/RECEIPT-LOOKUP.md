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
