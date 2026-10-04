# Haccora rollout for existing Dishbee tenants

Use the SaaS Factory rollout functions after the Dishbee tenant exists.

## Generic tenant

`platform_enable_haccora_for_dishbee(tenant_id, enable_ai)`

The function is idempotent and:

- requires an existing Dishbee tenant product;
- selects the Haccora GB or DE country pack from the tenant;
- requests the Haccora product in `dishbee-addon` mode;
- queues product provisioning;
- requests core HACCP, allergens, evidence, traceability, training, inspections, analytics and Dishbee sync;
- when `enable_ai=true`, also requests AI Copilot, document AI, RAG, GraphRAG and regulatory intelligence;
- leaves `haccora.sensors` disabled until a sensor deployment is deliberately configured.

## 313 Brands pilot

`platform_enable_haccora_dishbee_pilot(true)`

Targets:

- `cafe1-luton`
- `cafe1-st-albans`
- `mealdeck`

Run `platform_bootstrap_dishbee_pilot()` first if the pilot tenants have not yet been created.

## Activation boundary

Requesting the add-on does not fabricate a live Haccora connection. The provisioning worker must still:

1. select the GB or DE Haccora deployment;
2. create or link the Haccora workspace;
3. generate the tenant-specific `oqcp_` credential;
4. bind the Haccora workspace to Omniqora;
5. verify the connector;
6. complete dependent Haccora service jobs.

Until that verification succeeds, the product remains requested/provisioning and the Haccora app fails closed for central AI.
