# Call masking

Omniqora owns the masking session and participant mapping. Telephony providers are adapters.

## Core flow

1. Source SaaS requests a temporary masking session.
2. Omniqora allocates a tenant/provider proxy number that does not collide for either participant.
3. Private participant numbers are stored in a service-role-only table.
4. The customer/agent sees only the proxy number.
5. Provider inbound webhooks verify the provider signature, then resolve proxy number + caller to the opposite participant.
6. Provider bridges the active call with the proxy number as caller ID where supported.
7. Completion/expiry closes the Omniqora session and records usage/audit events.

## Twilio

Twilio Proxy is not the default architecture. New masking deployments should use a provider adapter around Programmable Voice or SIP. A legacy Proxy adapter may be supplied for accounts that already have Proxy access.

## Privacy/security

- browser/mobile clients never receive the other participant's private number;
- provider webhooks must be signature verified before resolution;
- recordings default off and require a tenant/jurisdiction policy;
- participant tables are service-role only;
- session metadata must not contain unnecessary PII;
- retention and call-record rules are region/tenant policy.

Typical consumers: Dishbee driver calls, MotoResQ recovery, SparesGrid buyer/supplier, Syndriva marketplaces and field-service products.