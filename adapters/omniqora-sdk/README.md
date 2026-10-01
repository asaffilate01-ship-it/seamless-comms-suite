# Omniqora SaaS Adapter SDK

This is the standard server-to-server integration path for existing and new SaaS products.

## Principle

The source SaaS remains authoritative for its domain records. Omniqora receives scoped events and provides shared modules through contracts. Do not copy service credentials into browser/mobile code.

## Configure

Create an operator-managed service credential in Omniqora with explicit scopes:

- tenant ID;
- product key;
- optional tenant-product ID;
- optional locations;
- capability allowlist such as `events.write`.

The stored database row contains only the SHA-256 secret hash. The plaintext token is provided to the source deployment secret manager.

Token format:

`<keyId>.<random-secret-32+-chars>`

## Example

```js
import { createOmniqoraClient } from "./adapters/omniqora-sdk/client.mjs";

const omniqora = createOmniqoraClient({
  baseUrl: process.env.OMNIQORA_URL,
  serviceToken: process.env.OMNIQORA_SERVICE_TOKEN,
  tenantId: process.env.OMNIQORA_TENANT_ID,
  productKey: "dishbee",
});

await omniqora.emit({
  id: "evt_order_123_completed",
  type: "order.completed",
  idempotencyKey: "order:123:completed:v1",
  subject: { type: "order", id: "123" },
  payload: {
    locationRef: "st-albans",
    amounts: { grossMinor: 2499, currency: "GBP" },
  },
});
```

CRM, Analytics, Financials, Journeys, Feedback and other subscribed modules can consume the same event without adding those systems directly into the source SaaS.

## Migration pattern

1. connect one product/tenant with a restricted service credential;
2. emit read-only business events;
3. verify tenant isolation and idempotency;
4. enable one Omniqora module entitlement;
5. shadow/compare against existing product behaviour;
6. move workflows only after acceptance.

No direct cross-product database reads are required.
