# Local UK-inbound travel sites on TraveNexa

Four independent market-oriented consumer website entrypoints share one travel backend:

| Site build | Visitors | HTML language | Display currency | URL when previewed together |
| --- | --- | --- | --- | --- |
| Korea | Korean residents going to UK | ko-KR | KRW | /kr/ |
| Japan | Japanese residents going to UK | ja-JP | JPY | /jp/ |
| China | Chinese residents going to UK | zh-CN | CNY | /cn/ |
| USA | US residents going to UK | en-US | USD | /us/ |

**TraveNexa is the *only* travel supplier connector and multi-tenant data-plane landlord.** Each website must become a tenant of TraveNexa with its own verified hostname and control-plane identity. FlightLounge is an optional flight-specialist brand and interface; never a second travel API landlord.

This same landlord also supports the branded travel tenants **MarocWays**, **Route50**, **FlightLounge** and **BestFares BestRates**, as well as these four local-market UK-inbound sites. Route50's region/website source has not been verified; it is listed only as a generic branded travel tenant, with no independent supplier credentials. The market-site code here is one tenant-facing frontend template, **not** the canonical TraveNexa supplier backend.

All brand labels in this app are working titles. No domains, Chinese ICP licence, local company incorporation, payment methods or supplier API permissions are implied by these builds.

## Features in the website UI

- Premium responsive market-specific hero, navigation, native-style mobile bottom menu and localized accessibility text.
- Five UK-focused categories: airport transfers, hotels, private/local transport, rail/coach, attractions/experiences.
- Search form with airports, UK destinations, dates, people and optionally flight details; localized display-currency label and clear no-availability fallback.
- Distinct HTML language/SEO metadata, alternate-language hints and standalone web-app manifests for the four routes.
- Source-country and destination-country restrictions enforced by a server-side gateway.
- No displayed fake rates, unverified suppliers, checkout pages or fabricated booking reference codes.

## Local development

In the repository root, first install its dependencies as usual:

```bash
bun install --frozen-lockfile
bun run build:travel-sites
bun run typecheck:travel-sites
bun run test:travel-sites
```

For the development site, run **two terminals** from `apps/travenexa-market-sites`:

```bash
node server.mjs           # /api/travel/search, default port 4301; returns 503 without supplier backend
../../node_modules/.bin/vite --port 4300
```

Open `http://localhost:4300/kr/`, `/jp/`, `/cn/`, or `/us/`. Previewing the pages and trying the form is possible without any external supplier credentials. An unavailable result is intentional.

For a production-like static+API preview after build, run `node server.mjs` then visit `http://localhost:4301/kr/`. This is not itself a public deployment.

## Contract with the canonical TraveNexa backend

The server has one read-only upstream request:

```
POST {TRAVENEXA_API_ORIGIN}/v1/inbound-uk/search
Authorization: Bearer {TRAVENEXA_SERVER_TOKEN}
X-Travenexa-Market: KR | JP | CN | US
Content-Type: application/json

{
  "sourceMarket": "KR",
  "destinationCountry": "GB",
  "productType": "airport",
  "locale": "ko-KR",
  "displayCurrency": "KRW",
  "travelDate": "2027-01-19",
  "arrivalTime": "15:00",
  "travellers": 2,
  "from": "LHR",
  "to": "London"
}
```

The *upstream* must verify tenant identity/entitlements, real partner offer IDs and live availability. An approved response has this shape:

```json
{
  "status": "live",
  "offers": [
    {
      "id": "signed-tenant-scoped-offer",
      "title": "UK operator transfer",
      "supplierName": "Verified supplier",
      "amount": 0,
      "currency": "GBP",
      "verified": true,
      "live": true,
      "expiresAt": "2027-01-19T15:10:00Z",
      "bookingMode": "affiliate"
    }
  ]
}
```

Example values explain the interface only, **not a real travel quote or a connected supplier**. Direct booking/checkout is **not** implemented. Even affiliate URLs are omitted unless explicitly included in the approved `TRAVENEXA_REDIRECT_HOSTS` server-side list. Prices should be served in the actual authorised price currency; **do not invent FX conversions just to match the customer market**.

The `server.mjs` app requires `TRAVENEXA_API_ORIGIN` to be an HTTPS **origin only**, and a server-only `TRAVENEXA_SERVER_TOKEN` of 24+ characters. It must never be exposed through `VITE_` variables. If missing, search returns HTTP 503 with `supplier_gateway_not_configured`.

## Country deployments

Deploy the **same codebase** as four separate websites. At each verified domain, set one of `SITE_MARKET=kr`, `jp`, `cn`, `us`; the gateway blocks another market's API request. The root route redirects to the configured local page. Use a trusted load balancer, CDN, TLS certificate and proper deployment secrets. Configure absolute canonical/hreflang URLs only after verified domains are known.

For China, performance from mainland networks must be tested, and Mainland China hosting/Chinese CDN acceleration may require ICP authorization and a qualifying operator structure. Verify these separately rather than copying a .cn domain onto an arbitrary deployment.

## Critical go-live blockers

- The first TraveNexa server-side core now exists in `services/travenexa-core/`. Its tenant-bound `/v1/inbound-uk/search` contract matches this storefront gateway, but it remains **undeployed** and returns 503 without approved supplier adapters and tenant credentials.
- UK private-hire/airport-transfer bookings must be supplied/accepted under an appropriate licensed business arrangement; obtain operator/licence legal review before processing any booking on these sites.
- Selling rail tickets directly requires appropriate licensed/accredited retail arrangements; affiliate partner models are a safer starting point.
- Hotels, tours and combined travel packages require the seller/agent model, refunds, merchant-of-record, consumer protection and applicable UK package travel/ATOL review.
- Each region's privacy laws, consumer-facing terms, payment eligibility, translation quality, local SEO and marketing consent must be approved.
- Live supplier offers and confirmation/refunds are only enabled after independent server-side verification, end-to-end tests and payment/supplier reconciliations.

More detailed scope: `docs/saas-factory/TRAVENEXA-FLIGHTLOUNGE.md`.
