# Omniqora Platform SDK

Server-only client for any SaaS/product that consumes Omniqora shared engines.

## Setup

Create one scoped service credential in Omniqora. Store the returned token in the source SaaS secret manager, never browser code.

```js
import {createOmniqoraPlatformClient} from "./client.mjs";

const omniqora=createOmniqoraPlatformClient({
  origin:"https://omniqora.example.com/",
  token:process.env.OMNIQORA_SERVICE_TOKEN,
});
```

## Core calls

- `context(scope)` — tenant product, active modules, region/country and locations;
- `entitlement(scope,moduleKey)` — authoritative module check;
- `usage(scope,usage)` — idempotent metering;
- `event(envelope)` — publish a canonical platform event.

The source app keeps its domain database. This SDK is the stable boundary; it must not read Omniqora tables directly.
