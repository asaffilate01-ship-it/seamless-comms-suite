# Omniqora VRP Matrix Batch — 16-node controlled pilot (15 October 2026)

This development phase is stacked on a reconciled Omniqora CRM/Dispatch/Routing PR, not deployed.

## Scope and per-tenant cost control
A dispatcher can queue a road-aware plan with 9–16 distinct source coordinates (driver positions plus dispatch job stops). Four tile jobs cover the complete 16×16 matrix, each with no more than eight origins and eight destinations. The existing SQL admission quota of 8 requests/256 elements per UTC day is **unchanged**; 16 points consume all 256 daily elements for that tenant/product. Reservations are atomic across every tile: an insufficient remaining quota rejects the entire batch without partial jobs. Idempotent repeated requests do not double reserve. These are volume limits, not a provider billing guarantee; commercial provider billing alerts are mandatory.

## Provider and planning gates
Only completed 'road' or qualified 'traffic' receipts from one provider with full coverage can be assembled. Traffic receipts expire after ten minutes; road receipts after 24 hours. The 16-node optimiser uses their verified distance/time edges, preserves capacity, skills, shift and time window constraints, and refuses missing/unreachable work for dispatch approval.

The batch-bound apply procedure rechecks all tiles, unique square matrix axes, scopes, quality, age and current dispatch stop coordinates in the same transaction as assignment. A legacy unbound native route retains manually reviewed estimated planning and cannot be labelled a verified road ETA.

## Remaining operational work
Set up a separate verified provider account and server-only credentials, test with real mobile drivers and delivery jobs, prove location consent and retention, add retry reservation/failed tile recovery and monetary reconciliation, and conduct controlled Fleetora shadow → read → write cutover. This phase does NOT implement continuous dynamic rerouting, offline queue, native tracking SDK or proven recipient signature. Neither provider fees nor customer ETAs are fabricated.
