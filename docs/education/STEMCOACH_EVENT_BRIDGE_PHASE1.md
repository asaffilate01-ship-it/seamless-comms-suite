# Omniqora STEMCoach education event boundary — Phase 1

This source update adds an explicit, metadata-only event contract for the existing
STEMCoach product key in the Omniqora ecosystem catalogue. It does not create a
credential, source emitter, payment, AI job or a live connection.

## Accepted event shape (server-to-server only)

Existing endpoint: POST /api/integrations/events.

Headers: Authorization: Bearer (operator-provisioned connection secret);
X-Event-Timestamp: 13-digit milliseconds within five minutes; Idempotency-Key:
stable, unique source event identifier.

Body:
  {"title":"STEMCoach learning signal","input":"{\"tenantId\":\"approved-source-tenant\",\"scopeId\":\"approved-scope\",\"eventType\":\"learning.summary.ready\",\"recordId\":\"7f15abed-48aa-4c03-a60b-bef345b8725e\",\"revision\":1}"}

Approved event types for product stemcoach:
- learning.summary.ready
- learning.practice.completed
- learning.review.due

Only an approved bearer binding with matching source tenant, allowed scope, enabled
event contract, valid expiry, genuine entitlements and current service-user
membership may be accepted. The bridge rejects arbitrary event titles, unknown
event types and extra fields such as student IDs, grades, answers or chat text.
RecordId refers to an opaque source-side EVENT ID, not learner identity.

The event accepts only a notification envelope. Omniqora must separately
authenticate and authorise any later context retrieval and must respect
school/guardian consent and original data-source permissions.

## Activation remains blocked until

1. SchoolDash and UniPathway school/centre mapping is verified on both sides.
2. STEMCoach has a service-owned event outbox with explicit learner/guardian
   consent where applicable and no personal education data in the envelope.
3. Operator registers a scoped OMNIQORA_BRIDGES_JSON binding for product
   stemcoach with contracts=["event"] and service-only OQ_BRIDGE_* secret.
4. Test foreign tenant, forged record ID, expired/revoked token, duplicate id,
   payload injection and provider unavailability in staging.
5. Deploy and test receipt reconciliation; HTTP 202 is an acceptance receipt,
   NOT completed processing or successfully communicated student progress.
6. Complete academic and safeguarding review before any automated intervention.

There is no production deployment, migration or credential change in this PR.
