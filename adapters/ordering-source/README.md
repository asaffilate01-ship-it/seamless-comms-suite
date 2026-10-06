# Ordering source integration

The shared Ordering API is the machine boundary for WhatsApp, phone, app and web ordering.

## Capabilities

A source service credential may receive:
- `ordering.write`
- `ordering.validate`
- `ordering.accept`
- `ordering.read`

## Flow

1. Omniqora Connect/Reception creates an order intent.
2. Source SaaS resolves the exact tenant/location and reads its authoritative catalogue.
3. Source validates item IDs, modifiers, prices, availability and fulfilment.
4. Source records a validation receipt.
5. Existing source payment flow is used where needed.
6. Source creates the real order in the authoritative EPOS/order database.
7. Source records acceptance and later KDS/operational state through events.

Never expose the service credential to a browser or model. AI produces typed proposals only; the source adapter validates every reference.
