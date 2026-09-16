# Phase 5 integration kit

## Integration pattern

Each SaaS registers once as an application. Each customer business, site, project or authority is then registered as a tenant beneath that application. Inbound events include `tenant_id`, and AI Core verifies that the tenant belongs to the sending product before accepting the event.

## Two-way bridge

1. The SaaS sends a signed event to AI Core.
2. AI Core validates the application, tenant, event contract and idempotency key.
3. A workflow runs in deterministic or AI-assisted mode.
4. High-risk results wait for human approval.
5. The approved result is signed with the destination-specific secret.
6. The SaaS receives the callback and applies the permitted action.

## Initial tenant mapping

- Dishbee: business or branch, including Café 1 Luton and Café 1 St Albans.
- Haccora: food-business site.
- Cirqiva: waste producer, carrier or facility account.
- Premisora: construction project.
- DOMUREVA: local authority, property owner or funded programme.
- Dokuvera: workspace or matter.
- Zoryn Pay: merchant account; recommendations only until payment controls are approved.

## Security requirements

- One inbound and one outbound secret per application/destination.
- HTTPS callbacks to allowlisted domains only.
- Tenant ownership checked before persistence or execution.
- Idempotency keys on inbound events and outbound results.
- Customer source records remain in their SaaS; AI Core stores only workflow inputs, outputs and audit evidence needed for operation.
