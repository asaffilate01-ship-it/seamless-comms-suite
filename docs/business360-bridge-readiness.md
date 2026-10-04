# Business360 bridge readiness

Workspace owners and administrators can run **Check AI draft readiness** on
`/app/integrations`. This is an on-demand, read-only preflight for an existing
operator-configured product bridge. It does not activate a connection.

The host resolves the connection within the selected workspace, verifies its
enabled state, expiry, credential presence and Business360 entitlement, and
checks its source service user's current workspace membership. A signed request
then checks the assigned Business360 project, bridge table availability, project
pause state, AI policy, data-sharing approval, specialist role, model binding and
provider configuration presence. The host rechecks the binding, credential,
source membership and requesting administrator before returning the result.

No source records, legal evidence or customer data are submitted. No model is
called, no quota is reserved and no bridge receipt is created. Results are
displayed with a check time and are not persisted as deployment approval.
The browser cannot choose another service user, project or model.

## Interpreting results

- **Setup needs attention:** resolve the listed failed checks and run again.
- **Ready for a controlled test:** local prerequisites passed at that time.
  This does not prove provider credentials are valid, network access works,
  source delivery is wired, or generated results meet requirements.
- **Unable to verify:** inspect host/service configuration and deployment
  migrations. A missing project membership fails closed rather than returning
  another project's configuration.

This check concerns AI drafts. An event-only bridge may legitimately have no AI
route and fail this preflight while still accepting its authorised metadata
notifications. Bedrock uses its deployment credential chain; Ollama may run
without a credential. Neither provider is probed by this check.

Deploy both the host application and Transformation service to expose the new
`bridges.readiness` command. No new migration is required. An older service
fails the check rather than being labelled ready. Continue with an explicitly
authorised source-specific smoke test and review the result before activation.

## Verification

Transformation unit tests cover tenant/project access, revoked/viewer roles,
policy and binding blockers, missing credentials, malformed input, and absence
of model calls, receipts and quota changes. Product bridge tests cover host
binding checks and rejection of invalid readiness responses.
