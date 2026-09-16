# Phase 4 acceptance checklist

An application may leave simulation only when all six checks pass:

1. The D1 database is bound and migrations are applied.
2. Its webhook secret is configured and a signed test event succeeds.
3. At least one validated workflow is registered.
4. At least five representative simulation runs have been reviewed.
5. Human approval is enabled for medium and high-risk actions.
6. Daily and monthly budget limits are configured.

## Product rollout order

Start with Dishbee and Haccora because their operational events and approval owners are already defined. Add Cirqiva next for waste optimisation, then Premisora and DOMUREVA for higher-risk construction and grant decisions. Dokuvera remains the shared document bridge. Zoryn Pay stays in recommendation-only mode until payment-provider and compliance controls are formally approved.
