# Omniqora road matrix v3 — controlled extension

Base: reviewed PR #104. Source only: no account keys, map calls, releases or migrations applied to production.

One tenant/product can queue at most 8 requests and 256 origin/destination pairs per UTC day. Each request is capped at 8×8=64 pairs. Tenant administrator and active routing entitlement are checked in the SQL admission transaction. Duplicate request keys return the same job; changing inputs fails. Quotas count requests, NOT actual vendor invoices; vendor billing caps must be configured separately.

Planned runtime: server-only Google Routes REST traffic-aware matrix and openrouteservice road matrix, only after fresh approved provider binding, with fixed hosts and environment secrets. No provider is activated in this migration. Haversine offline fallback has no road ETA and must remain clearly labelled.

Official specs:
- https://developers.google.com/maps/documentation/routes/compute_route_matrix
- https://github.com/GIScience/openrouteservice/blob/main/docs/api-reference/endpoints/matrix/index.md

Rollout: integrate reviewed provider bindings, strict response validation and server-only evidence persistence; then real model route-distance ingestion, region/traffic semantics, key activation and device pilots.

## Execution completed in this branch
- /app/routing queues an operator-requested preview using the first eight current unassigned stop coordinates, then runs a separately authenticated server function.
- Real road data is sent to the fixed openrouteservice endpoint only if an ACTIVE production provider binding exists for the exact tenant/product with nonempty api_key secret reference, independent health flags (matrixReady and independentlyVerified), and verification within seven days. The server uses OMNIQORA_OPENROUTESERVICE_API_KEY; the browser never sees it.
- Authenticated operators cannot directly change matrix cells, jobs or receipts. A trusted service-role RPC atomically validates/persists the exact pair count and quality; failed and duplicate requests are recorded.
- Admin entitlement/product and provider-binding status are rechecked after HTTP completion, so revocation blocks acceptance of late results.
- Google traffic-aware adapter has offline tests but its execution remains DISABLED until content-retention, attribution, eligible regional usage and independent licensing review are completed. Never display Google matrix content on an OpenStreetMap base map.
- The current VRP solver still relies on native Haversine calculations; the matrix is a road-distance/ETA operator preview, NOT an automatic road-aware route optimiser.
- Operator must set vendor-side budgets/alarms. The SQL volume quota is not a financial spending cap.
