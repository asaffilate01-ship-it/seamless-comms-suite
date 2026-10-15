# Omniqora Phase 5 — Verified 16-location tiled road routing (15 October 2026)

This is a development-only, stacked change on PR #107, #105 and #104. All new migration/application code must pass isolated Supabase replay and the complete control-plane security suite. Do NOT activate map keys or apply production migrations from this document.

**Pilot size:** 9–16 distinct road nodes (driver starts plus task stops), using a deterministic 2×2 grid of four provider matrix jobs. Each tile is capped at 8 origins × 8 destinations. A complete 16-node tour requires four billed provider requests and 256 requested route elements, which meets the existing 8 request/256-element daily SQL tenant/product quota. SQL insertion and quota reservation are atomic: either all four tiles are admitted or all four reservations roll back.

Each route optimisation has exactly one batch, owned by tenant/product. Queue replay uses the existing batch without spending quota again; a changed node list requires a NEW optimisation. A tenant agent cannot queue or finalise road matrices, or directly edit batch tables.

An operator executes the queued tiles one at a time through the existing server-only provider worker. **Do not execute the tiles without verified provider access and billing limits.** The finalise RPC requires four fresh completed ORS driving road matrices with matching coordinates, no estimated/fallback cells, one provider, a verified active provider binding and exact cell coverage. It assembles 16×16 provenance-preserving cells into one aggregate matrix in a database transaction. Assembly makes NO provider call. The aggregate records the oldest provider completion time so its age cannot reset freshness.

The existing fleet optimiser reads the one aggregate matrix, validates every cell and the current authoritative driver/stop coordinates and uses verified journey times. The route-approval RPC checks aggregate batch ownership for matrices larger than eight nodes. The previous single-matrix queue cannot replace a queued tiled batch; unfinished batches cannot be applied as approximate/native plans.

Activation remains gated by merchant contracts, server credentials, route privacy, map licensing, driver GPS quality, retry recovery and user acceptance on actual roads. The current '16 locations' refers to unique nodes, not 16 separate vehicles or 16 deliveries; a job can have multiple stops. No automatic provider retry, Google traffic mode or self-dispatch is activated.

**Next scalability limit:** 17+ unique locations currently fail closed rather than silently exceeding provider quotas. Before lifting this limit, add costed provider batching with explicit tenant spending ceilings, large-instance VRP evaluation and recovery/rollback around contested dispatch.
