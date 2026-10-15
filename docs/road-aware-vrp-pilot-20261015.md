# Omniqora road-aware VRP pilot — 15 October 2026

This stacked phase extends PR #105 without releasing anything to production.

## Source of truth
The new route preparation action reads current unassigned dispatch jobs and ordered stops, available drivers/vehicles and recent driver positions from the authoritative tenant/product. Road planning requires an on-device GPS observation not older than 15 minutes. The source positions plus all stops form a distinct square matrix of at most eight unique coordinates for the pilot.

The tenant administrator requests the bound road matrix atomically via routing_queue_optimisation_matrix, calculates it through the separately authorised server-side provider, and runs the optimiser only when the matrix is settled as a complete, qualified 'road' or 'traffic' result.

The VRP scorer uses actual leg durations and distances for greedy allocation, block re-ordering, stop arrival calculations and time-window/shift checks. Missing or unreachable legs are not filled with Haversine estimates. A work item that cannot be served safely is explicitly unassigned; a road-bound proposal with unassigned work or time-window breaches is not eligible for application.

The application RPC checks provider, matrix freshness and completeness, tenant/product, constraints and current stop coordinates again before modifying job assignments. Road matrices expire after 24 hours; traffic matrices after 10 minutes.

## Isolation of approximate planning
Legacy/native route planning without a bound road matrix remains supported as an explicitly labelled straight_line_estimate and retains manual-review governance. It must not be represented as a live traffic ETA.

## Pilot boundaries
No autonomous dispatch, provider account setup, production migrations, vehicle telematics or driver app releases. Eight unique coordinates per bound route are a pilot cap, not a full-scale VRP solution. Future milestones include tile-based matrix billing/admission, higher-volume orchestration, fresh rerouting, verified GPS source events, parallel route risk tests and provider spending reconciliation. Google traffic-aware execution remains disabled pending licensed usage review.
