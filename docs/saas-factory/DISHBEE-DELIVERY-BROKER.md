# Omniqora Delivery Broker — Dishbee family runtime

The Delivery Broker is a shared Omniqora service consumed by Dishbee+, Dishbee One,
Dishbee Hive, MealDeck and other products that require last-mile fulfilment.

## Provider set

Current provider catalogue:

- `own_fleet`
- `uber_direct`
- `deliveroo_express`
- `just_eat_go`
- `stuart`

A provider being present in the catalogue does **not** mean production access exists.
Commercial approval, country availability, production credentials and provider acceptance
remain independent activation gates.

## Request flow

For a direct-order channel such as Dishbee+:

1. Create `quote.request`.
2. Execute `quote.execute`.
3. The broker asks all enabled and eligible provider accounts for quotes.
4. The routing policy selects the best eligible quote.
5. Dishbee+ shows the customer the selected fulfilment charge.
6. The customer pays the order.
7. Only after verified payment, queue `book.execute`.
8. The booking worker books the selected provider.
9. Provider status/tracking is projected back to the product.

The durable booking queue exists so a courier/API outage after payment does not lose the order.

## Dishbee+ charging

Confirmed Basic behaviour:

- £99/month per physical merchant location;
- 0% Dishbee marketplace commission;
- delivery cost is customer pass-through by default;
- merchant subsidy/fixed delivery pricing is opt-in;
- Dishbee Buzz is separate.

The selected fulfilment price is therefore not silently deducted from merchant product sales
under the default Dishbee+ plan.

## Own fleet

Own-fleet provider accounts use Omniqora Dispatch/Fleet/Tracking.

An own-fleet quote requires:

- pickup/drop-off coordinates;
- an enabled `own_fleet` provider account;
- an available dispatch agent unless account settings explicitly permit quoting without one;
- configured effective cost/ETA settings.

Booking creates a dispatch job with pickup and drop-off stops and reserves an available agent.

## External connector contract

External providers are represented by an enabled row in `delivery_provider_accounts`.

The account's settings include the server-side connector base URL. `credential_handle`
contains the **environment-variable name**, never the raw provider token.

Example conceptual account configuration:

```json
{
  "provider_key": "uber_direct",
  "account_model": "merchant_account",
  "credential_handle": "DISHBEE_UBER_DIRECT_TOKEN_MERCHANT_123",
  "settings": {
    "connectorBaseUrl": "https://delivery-connectors.example/uber-direct"
  }
}
```

The connector implements:

### Quote

`POST /quote`

Input:

```json
{
  "provider": "uber_direct",
  "request": {
    "pickup": {},
    "dropoff": {},
    "readyAt": null,
    "orderValueMinor": 2500,
    "currency": "GBP"
  }
}
```

Output:

```json
{
  "available": true,
  "quoteRef": "provider-quote-id",
  "priceMinor": 429,
  "pickupEtaMinutes": 12,
  "deliveryEtaMinutes": 31,
  "expiresAt": "..."
}
```

### Book

`POST /deliveries`

Input includes provider, selected quote reference and the product order reference.

Output:

```json
{
  "deliveryRef": "provider-delivery-id",
  "trackingUrl": "https://...",
  "courier": {}
}
```

## Merchant vs platform-managed accounts

Provider accounts support:

- `merchant_account` — the merchant has the provider contract/account;
- `platform_managed` — only use after Dishbee/Omniqora has the appropriate master,
  reseller or aggregator commercial arrangement;
- `own_fleet` — the merchant/venue's own delivery operation.

Do not send unrelated merchants through a single ordinary merchant courier account.

## Marketplace orders

Delivery Broker selection applies to direct channels such as Dishbee+, own website/app,
phone/WhatsApp ordering and other channels where the merchant controls last mile.

An Uber Eats/Deliveroo/Just Eat marketplace order follows the fulfilment arrangement attached
to that marketplace order/merchant agreement. The broker must not silently substitute a
different courier network unless the marketplace contract supports that workflow.

## Service credential

Dishbee+ calls `POST /api/platform/delivery` through a scoped Omniqora service credential.

Typical capabilities:

- `delivery.quote`
- `delivery.route`
- `delivery.book`
- `delivery.read`

Credentials are tenant/product scoped. Never expose them to a browser or kiosk.

## Routing policy

Routing can enforce:

- own-fleet preference;
- provider priority;
- maximum cost;
- maximum ETA;
- ETA value/cost weighting;
- merchant account enablement;
- country/provider availability;
- location-specific policy.

This is a shared engine. Do not reimplement the provider comparison logic separately in
Dishbee+, MealDeck or Hive.
