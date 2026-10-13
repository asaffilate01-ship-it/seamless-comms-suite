# TraveNexa + FlightLounge in the Omniqora SaaS Factory

**Status (13 October 2026): catalogue, source inventory, blueprints and provider onboarding directory are committed in a feature branch. Not deployed, not API-connected, not production-bookable.**

## Existing product decisions recovered

- **TraveNexa** is the canonical *multi-tenant travel technology landlord*: travel offers, partner APIs, shared supplier adapters, search/booking/referral control, pricing provenance, tenant configuration and white-label travel SaaS.
- **FlightLounge** is the premium consumer flight discovery/metasearch brand **and** the branded flight-access surface that consumes the shared TraveNexa flight connector layer. It must not duplicate supplier auth or tenant-level secrets.
- **BestFares BestRates** is a comparison tenant; **MarocWays** is a destination-specialist tenant.
- Future travel agents and travel brands can be created as independent white-label tenants.
- **Omniqora** remains the top-level SaaS/AI factory, not the travel domain system of record. It supplies identity, CRM, omnichannel support, AI agents, analytics, billing entitlement control, partner onboarding, connectors and provisioning.
- No source repository or deployed product URL for TraveNexa/FlightLounge has been verified in this GitHub connection. Do not replace this with an assumed repository or a separate fictional FlightLounge landlord.

## What is registered in the SaaS Factory

| Element | Key / type | State |
| --- | --- | --- |
| Landlord product | `travenexa` | External product, beta; not connected |
| TraveNexa platform tenant blueprint | `travenexa-platform` | Discoverable, blocked until verified external workspace |
| FlightLounge blueprint | `travenexa-flightlounge` | TraveNexa `flight_metasearch` workspace |
| BestFares BestRates blueprint | `travenexa-bestfares` | TraveNexa `comparison` workspace |
| MarocWays blueprint | `travenexa-marocways` | TraveNexa `destination` workspace |
| Future agency blueprint | `travenexa-white-label` | TraveNexa `agency` workspace |
| Supplier directory | `travel.*` keys | 13 catalogue-only providers; **none authenticated** |
| Product inventory | Rows 121–124 | Original source inventory rows 1–120 preserved |

Core/service keys: `travenexa.core`, `provider-connectors`, `flight-search`, `flight-redirects`, `flight-booking`, `flightlounge`, `hotel-search`, `car-hire`, `activities`, `transfers`, `esim`, `price-alerts`, `white-label`, `ai-concierge` (all prefixed `travenexa.`).

The migration uses `implementation_status='external_product'` and supplier `implementation_status='catalogue_only'` so that a blueprint cannot by itself prove a working external API or product connector. The factory provisioning policy blocks activation until a linked external workspace and its authoritative credential have been verified.

## Supplier onboarding / credential needs

Supplier names below are *integration targets*, not statements that approval, accounts, APIs or commissions are already available.

| Integration | Initial use | Access needed |
| --- | --- | --- |
| Travelpayouts | Affiliate/data and tracked flight referrals (first pilot) | Partner registration, campaign/marker ID, token where granted |
| Skyscanner Travel APIs | Live and indicative flight metasearch | Partner/API approval, API key, limits, permitted traffic/use case |
| Duffel | Flight offers, order creation and management | Commercial onboarding, test/live API tokens, order permissions |
| Amadeus | Flight/hotel/destination supply | Developer app/client credentials and relevant production approval |
| Travelfusion (tfNDC) | LCC/NDC airline supply | Direct commercial agreement, provider documentation and credentials |
| Booking.com Demand | Hotels; permitted compare/redirect or approved booking | Demand partner access, affiliate ID, token, sandbox |
| Hotelbeds / RateHawk | B2B accommodation rates and reservations | Approved trade contracts, credentials and booking/settlement terms |
| Viator / GetYourGuide | Experiences, tickets, tours | Affiliate or API programme approval and tracking credentials |
| Discover Cars | Car rental | Affiliate/API partner approval and tracking |
| Welcome Pickups | Airport transfers | Partner terms and integration onboarding |
| Airalo Partners | Travel eSIM | Partner access, integration mode and attribution |

Do not save API keys to GitHub, edge clients, mobile bundles, tenant metadata or arbitrary prompt/MCP payloads. Store them in server-side secret storage and give tenants non-secret binding references, scopes and supplier permissions. Never automatically share one tenant's customer information with another brand.

## Offer, attribution and booking boundaries

1. `search.create`: request from a specific tenant, with permitted travel providers/countries/currencies, rate limits, caching policy and audit ID.
2. `search.results`: normalize supplier offer IDs, origin, destination, travel dates, fare class, included baggage, cancellation/rebooking conditions, currency, displayed all-in price, data freshness, taxes and provider terms. **Do not present cached indicative rates as bookable live quotes.**
3. `offer.select`: save signed offer reference, provenance, source provider, expiry and terms; prevent substitution between tenants.
4. **Affiliate route:** a server-issued short-lived tracked redirect to supplier/OTA; record only eligible referrals and verified commission events; do not claim completed sales without an authoritative provider confirmation.
5. **Direct checkout route:** explicitly opt-in, only after supplier approval and travel compliance review. Reprice/revalidate offers, collect travellers' consent, complete payment with PCI-safe provider flow, create/verify order and hand off PNR/ticket details. Human approval for material AI-driven write actions.
6. `postbooking`: manage changes, cancellations, refunds, chargebacks, airline schedule changes and support cases through supplier contract rules. Never claim successful refund/issuance before provider acknowledgement.
7. `reconciliation`: separate gross customer order value, platform net revenue, affiliate commission receivables, supplier liabilities, card fees and refunds. Do not treat flight GMV as earned commission revenue.
8. `alerts`: saved searches and consented price notifications, capped and deduplicated across permitted data sources; honour source licence/caching constraints.

## Omniqora / AI Agent Factory connections

- **Identity:** tenant-scoped travel customer and agency roles; travel clients need not join Omniqora admin automatically.
- **CRM + Connect:** WhatsApp/Twilio, email, voice, quote follow-ups, trip assistance, abandoned searches and support tickets, with GDPR controls.
- **Agent tools:** `travel.search`, `travel.compare`, `travel.itinerary.draft`, `travel.alert.create`, `travel.referral.prepare`, and (once approved) `travel.booking.quote`, `travel.booking.submit`, `travel.booking.manage`. Agent responses must distinguish real supplier evidence from recommendations; enforce identity, entitlements and confirmation.
- **MCP:** expose tenant-scoped reusable travel tools through the Omniqora connector registry with read-only defaults, strict tool-permission scopes, quota budgets and result caching subject to provider rights.
- **Finances:** invoices, reconciled commissions and platform subscriptions are separate ledgers; payment agent actions require explicit approval.

## Mobile and white-label UX

- TraveNexa tenant templates: SEO website, native-feeling mobile PWA (bottom navigation), agency dashboard, trip wallet, saved fares, alerts, compare cards, accessible travel options, checkout handoff and support.
- Prepare shared design tokens and typed API contracts for later iOS/Android native shells; do not represent a PWA as a launched native app.
- FlightLounge uses premium flight-led branding, but its API searches and affiliate attribution must be tenant-scoped. BestFares BestRates and MarocWays can use different templates and product configurations without cloning provider integrations.

## What still blocks a live rollout

1. Locate and audit the real TraveNexa/FlightLounge source(s), branch(es), domain ownership and any previous supplier adapter implementation.
2. Implement or connect the travel product's multi-tenant data plane and control-plane snapshot handshake (`oqcp_` one-time secret).
3. Complete approved Travelpayouts pilot and independent connector health verification; add suppliers incrementally, based on contractual availability and cost.
4. Implement normalized search, offer TTL/repricing, redirect attribution, source-vs-sold reconciliation, consent and operational dashboards; run sandbox tests.
5. Confirm merchant-of-record, payment handling, airline ticketing arrangements and applicable UK travel/consumer protections (including ATOL/package-travel obligations where relevant) *before* accepting direct booking payments.
6. Deploy schema migrations, configure vault credentials, validate a non-production FlightLounge tenant, confirm working provisioning jobs, and only then enable production.
7. Set commercial subscription tiers and fees deliberately; **no prices or supplier commissions are invented by this registration**.

> API directory presence, migrated database rows, or successful SQL tests are not proof of a working travel booking platform.

## Inbound-UK source-market websites (13 October 2026 expansion)

**New decision:** TraveNexa, not FlightLounge, is the **one main travel API/booking connector** for all UK-inbound country sites. FlightLounge stays the flight-specialist brand/UI module. The customer-facing websites must look locally operated in language, content and pricing *without* claiming a registered local company or local payment account where none exists.

| Source market | Factory blueprint | Default language | Presentational currency | Checkout wallet candidates (not active) |
| --- | --- | --- | --- | --- |
| South Korea → UK | `travenexa.uk-inbound.kr` | Korean (`ko-KR`) | KRW | International cards; assess KakaoPay, Naver Pay and Toss with eligible acquirers |
| Japan → UK | `travenexa.uk-inbound.jp` | Japanese (`ja-JP`) | JPY | International cards, JCB; assess PayPay with eligible Japanese-facing acquirers |
| Mainland China → UK | `travenexa.uk-inbound.cn` | Simplified Chinese (`zh-CN`) | CNY | Assess Alipay, WeChat Pay, UnionPay and cross-border settlement |
| United States → UK | `travenexa.uk-inbound.us` | English (`en-US`) | USD | International cards, Apple Pay and Google Pay where eligible |

The blueprint `country_code='GB'` is the default **operator jurisdiction** and must **not** be interpreted as source market. Source country is stored separately in `metadata.sourceMarket` and `blueprint_products.config.sourceMarket`. Changing country to KR/JP/CN/US does not register a locally incorporated operator or magically grant merchant onboarding approval.

No final country-site brand names, local domains or local operating entities have yet been agreed. The source-market templates use descriptive working titles. Country-code domains such as .kr/.jp/.cn have their own eligibility, ownership and (where applicable) local hosting and registration requirements. Do not assign a domain or a country-based legal address without verification.

### Customer-facing scope

1. Airport pickups at Heathrow, Gatwick, Stansted, Luton, Manchester, Birmingham, Edinburgh and further contracted UK airports; collection instructions, meet-and-greet, flight tracking, child seats, luggage, wheelchair-accessible vehicles, wait-time rules, licence/insurance verification.
2. UK hotel discovery, booking or permitted affiliate handoff; clear room occupancy, taxes, cancellation and check-in terms.
3. Pre-booked UK licensed private hire, chauffeur, minibuses and intercity transfers — operator identity and applicable licensing must be reviewed **before** TraveNexa takes a booking or payment.
4. UK train, coach and onward travel: prefer approved B2B/affiliate suppliers such as Omio initially; direct National Rail ticket sales require suitable rail retail licensing/accreditation or approved resale infrastructure. Never treat live train departure data as ticketing approval.
5. UK tours, attractions and day trips via approved contracted partners; avoid displaying unsourced availability and auto-combining products into a legal package without review.
6. Optional FlightLounge flight comparison, travel eSIM and digital concierge; not required for the UK ground-products launch.

### Market-localized commercial features

- Isolated tenant custom domain, identity, brand assets, marketing consent, events, attribution, analytics and currencies; shared TraveNexa supplier adapter credentials in the *central* server vault with strict per-tenant entitlements.
- Each local site has its own `lang` HTML page, translated copy, `hreflang` scaffolding, PWA manifest, accessible responsive layout and mobile bottom navigation. Set verified absolute canonical/hreflang URLs **after** domain activation.
- Market-specific content and acquisition channels: Naver/Kakao (KR); Google/Yahoo Japan/LINE (JP); Baidu/WeChat/Xiaohongshu (CN); Google/Meta/YouTube (US). Marketing is a *plan*, not an active integration.
- Payment display in KRW/JPY/CNY/USD requires an authorised rate/FX quote and full fee/settlement disclosure. No exchange rates or approval for every listed local wallet are assumed. Merchant of record, settlement currency, supplier liabilities, refunds and FX handling require sign-off.
- Supplier offers must specify the verified pricing country and validity. The API must refuse cross-tenant offer IDs, expired quotes and mismatched source market/destination country.
- The UK services are the same inventory surfaced through different local websites — do not scrape/synchronize four separate inventory copies.
- Traveller names, passports, flight details and support history remain subject to purpose limitation, protection, retention and cross-border transfer review.

### Travel supplier and legal gates

- A UK website accepting UK private hire bookings or payment may itself be acting as a private hire *operator*, even where another company supplies a driver. Confirm the operating/agency model and relevant local authority/TfL licence requirements. See [GOV.UK PHV operator guidance](https://www.gov.uk/operator-licence-private-hire-vehicle).
- Rail Delivery Group [licences](https://www.raildeliverygroup.com/our-services/retail-commercial/how-to-become-a-retailer/third-party-licences.html) and [accreditation](https://www.raildeliverygroup.com/our-services/retail-commercial/how-to-become-a-retailer/accreditation.html) apply to direct National Rail retailing; an approved licensed partner/referral model can be more appropriate at launch.
- Combining hotels, transport, attractions or flights into an inclusive package can trigger UK package-travel obligations and insolvency protection; flights also require [ATOL scope review](https://www.caa.co.uk/atol-protection/atol-requirements-for-the-travel-industry/do-i-need-an-atol/).
- For China, review [ICP filing/licensing before Mainland China hosting/CDN](https://developers.cloudflare.com/china-network/concepts/icp/) and PIPL/cross-border data requirements; externally hosted Chinese-language sites also require a genuine accessibility/performance test from mainland networks and jurisdiction-specific legal advice.
- South Korea has [PIPA requirements for overseas operators](https://pipc.go.kr/eng/user/ltn/new/noticeDetail.do?bbsId=BBSMSTR_000000000001&nttId=2488). Japan APPI and relevant US state privacy rules also need review.
- Official [Adyen Alipay](https://docs.adyen.com/payment-methods/alipay/) and [WeChat Pay](https://docs.adyen.com/payment-methods/wechat-pay/) documentation show potential cross-border routes, but actual merchant-country/payment-flow approvals must be verified. [PayPay](https://docs.adyen.com/payment-methods/paypay) has specific Japanese market constraints; do not promise it is immediately available to a UK merchant.

### Separate storefront implementation

See `apps/travenexa-market-sites/` for the four actual local-language web frontend shells. These are **code-complete UI entrypoints**, not independently deployed domains or production-bookable travel sites:

- `/kr/`, `/jp/`, `/cn/`, `/us/` when deployed together.
- One set of browser components and styling; separate country-specific HTML document, translated language pack, manifest and source-country API scope.
- `POST /api/travel/search` server gateway can forward to the *verified* `TRAVENEXA_API_ORIGIN/v1/inbound-uk/search`, using a secret only on the server. Without credentials/backend it returns HTTP 503; no mock fares, payment acceptance, operator bookings or fake supplier availability.
- `SITE_MARKET` restricts each separately deployed market site; production host/domain verification, rate limits, offer validity and provider redirect hostname allowlisting must be configured before go-live.

### Market rollout order

1. Build and smoke-test all four localized sites with supplier gateway disabled and verified logos/domains; complete legal/privacy notices and local content review.
2. Launch an approved UK ground-transport supplier pilot for a single market with real quotations and availability; add accommodation and attractions on an approved affiliate model.
3. Complete merchant and local-wallet eligibility, provider contracts, payments/webhooks/refunds, supplier reconciliation and operator licensing before enabling instant checkout.
4. Verify mainland-China accessibility and any needed local ICP/operating structure separately; do not assume a local-language website automatically meets Chinese regulatory or performance requirements.
5. Roll approved services to the remaining sites using the same TraveNexa gateway, each source market with isolated permissions and full independent end-to-end tests.

