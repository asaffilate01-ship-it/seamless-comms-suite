# Omniqora road matrix v3 — controlled extension

Base: reviewed PR #104. Source only: no account keys, map calls, releases or migrations applied to production.

One tenant/product can queue at most 8 requests and 256 origin/destination pairs per UTC day. Each request is capped at 8×8=64 pairs. Tenant administrator and active routing entitlement are checked in the SQL admission transaction. Duplicate request keys return the same job; changing inputs fails. Quotas count requests, NOT actual vendor invoices; vendor billing caps must be configured separately.

Planned runtime: server-only Google Routes REST traffic-aware matrix and openrouteservice road matrix, only after fresh approved provider binding, with fixed hosts and environment secrets. No provider is activated in this migration. Haversine offline fallback has no road ETA and must remain clearly labelled.

Official specs:
- https://developers.google.com/maps/documentation/routes/compute_route_matrix
- https://github.com/GIScience/openrouteservice/blob/main/docs/api-reference/endpoints/matrix/index.md

Rollout: integrate reviewed provider bindings, strict response validation and server-only evidence persistence; then real model route-distance ingestion, region/traffic semantics, key activation and device pilots.