# Dishbee family consolidated build matrix

This document is the implementation map for the Dishbee requirements recovered across the product threads. It prevents duplicate engines and keeps customer-facing product names separate from the shared Omniqora implementation layer.

## Product boundaries

| Customer product | Purpose | Shared implementation |
| --- | --- | --- |
| Dishbee | Master brand / family | Omniqora control plane plus vertical runtimes |
| Dishbee One | Restaurant operating system | Dishbee runtime + Omniqora shared services |
| Dishbee Hive | Dark kitchen / food hall / multi-operator OS | Dishbee Hive runtime + shared services |
| Dishbee+ | Multi-category consumer marketplace | Current `asaffilate01-ship-it/onyn` source + Omniqora Marketplace |
| Dishbee Buzz | AI, intelligence, engagement and automation add-on | White-labelled Omniqora AI/Analytics/CRM/Connect/Growth services |
| Haccora | Food safety/compliance add-on | Haccora vertical + Omniqora/Dishbee event bridge |
| MealDeck | Multi-brand food operator/tenant | Dishbee/Hive tenant, not a duplicate platform |

Germany may use a different public product name while retaining the same Omniqora product/runtime contracts.

## Dishbee One

Built or already present in Dishbee:

- EPOS/counter ordering and SumUp reader runtime;
- KDS and one-order/one-card projection;
- menu/categories/modifiers/channel pricing;
- online ordering/PWA;
- pickup, curbside, delivery and dine-in fulfilment primitives;
- tables/waiter/QR entitlement model;
- stock, recipe consumption, stocktake, waste, suppliers and purchases;
- staff, time entries, rota;
- CRM, promotions and loyalty foundations;
- phone/WhatsApp assisted ordering with payment links;
- group ordering with host/separate payments and timeout controls;
- own drivers plus multi-provider delivery orchestration;
- external marketplace ingestion into the same order/KDS core;
- landlord/tenant launch, domains, branding and entitlements;
- Omniqora control-plane and runtime event link.

Customer-facing name: **Dishbee One**. Internal/core code may continue to use Dishbee/Dishbee Core terminology.

## Dishbee Hive

Built or already present:

- Hive site/landlord model;
- independent vendor/company membership and brand ownership;
- vendor-scoped KDS;
- one customer basket across multiple kitchens/brands;
- one payment/customer order;
- vendor/company order partitioning;
- central pass/consolidation;
- pickup/curbside/delivery handoff code;
- Adyen platform split allocation and refund flow;
- shared marketplace/WhatsApp/site ordering;
- vendor-specific integrations;
- delivery routing through Dishbee/Omniqora;
- venue-wide kiosk mode:
  - every enabled kitchen/brand;
  - one basket;
  - pickup;
  - one payment;
  - same vendor KDS and central pass;
  - venue owner buys/owns kiosk hardware;
  - Dishbee provides software/device profile;
- add-on catalogue for Dishbee+, Buzz, Haccora and external marketplaces.

## Dishbee+

Confirmed commercial model:

- **£99/month per physical merchant location**;
- **0% Dishbee marketplace commission**;
- unlimited Dishbee+ marketplace orders subject to service limits/fair-use policy if later defined;
- payment-provider processing is separate;
- delivery is charged to the customer by default;
- merchant may explicitly subsidise or set a fixed customer delivery amount;
- Dishbee Buzz is not included in the £99 plan.

Marketplace scope:

- food;
- grocery;
- pharmacy/permitted health retail;
- convenience;
- general local retail;
- future categories.

Prescription-only/controlled/restricted medicine workflows require the appropriate regulated-pharmacy, prescribing/identity and fulfilment controls and must not be treated as ordinary grocery inventory.

Current source application: `asaffilate01-ship-it/onyn`.

Migration approach:

1. keep the application independently deployable;
2. register it as `dishbee-plus` in the Omniqora SaaS Factory;
3. consume shared services through scoped service credentials/control-plane snapshots;
4. hand restaurant orders to Dishbee after payment;
5. use generic Omniqora Marketplace for non-restaurant merchants;
6. progressively replace duplicated donor engines with Omniqora shared contracts;
7. rebrand customer-facing Onyn/OnynGo strings/assets/domain/app identifiers in a controlled release.

Retained donor features include customer tracking, scheduled/routine orders, substitutions, loyalty, referrals, gift/store value, support, driver workflows, supplier surfaces, QR/kiosk patterns, vendor rush controls, disputes/risk and provider/release assurance.

## Delivery

One shared routing concept is required across Dishbee+, Dishbee One, Hive and MealDeck.

Supported target providers:

- own fleet;
- Uber Direct;
- Deliveroo Express;
- Just Eat Go;
- Stuart.

Architecture:

`order source -> Omniqora Delivery Broker / Dishbee adapter -> quote -> policy ranking -> booking -> tracking -> proof/status`

Dishbee+ delivery policy:

- quote fulfilment before checkout;
- display the selected fulfilment cost to the customer by default;
- do not deduct the default delivery cost from merchant goods proceeds;
- only book the external courier after payment is verified;
- persist quote/request/provider/job references;
- durable retry queue for post-payment booking failures.

Merchant marketplace orders (for example an Uber Eats marketplace order) retain the marketplace's configured fulfilment contract rather than being silently rerouted to another courier.

## Marketplace / POS Integration Hub

Target marketplace direct connections:

- Uber Eats;
- Deliveroo;
- Just Eat.

Direct connection is preferred after Dishbee has the required commercial/API/certification approval.

Optional middleware bridges:

- Deliverect;
- Otter;
- UrbanPiper.

These are migration/fallback transports, not required merchant products once a direct Dishbee route is production-approved.

POS/source connector roadmap:

- Foodics;
- Dines;
- Toast;
- Square;
- SumUp;
- Lightspeed;
- Epos Now;
- Grafterr.

Additional marketplace roadmap can include Wolt, Talabat, Careem, noon Food, foodpanda, Glovo and Grubhub/Seamless by market.

Shared connector runtime must provide:

- provider/country catalogue;
- certification state;
- merchant/store authorisation;
- field/SKU/PLU/modifier/category/status mappings;
- menu publication and rollback;
- availability/86 sync;
- order ingestion and idempotency;
- accept/reject/status propagation;
- retries/dead-letter handling;
- health/SLA visibility;
- settlement/reconciliation;
- direct vs bridge routing.

A saved token/store ID never equals production approval.

## Dishbee Buzz

Dishbee Buzz is a customer-facing Dishbee add-on. Restaurant customers are not sold “Omniqora” to receive it.

Packages currently represented:

- Buzz Essentials — AI assistant/basic insights;
- Buzz Growth — CRM/RFM/journeys/campaigns/feedback;
- Buzz Pro — profitability, inventory/delivery/operational intelligence;
- Buzz Voice — voice/receptionist/communications plus usage.

Underlying reusable services remain Omniqora services so the same engines can power other portfolio products without copying code.

Examples of Buzz outcomes:

- daily business brief;
- menu/product performance;
- demand and staffing signals;
- stock/replenishment warnings;
- marketplace contribution margin;
- delivery cost/provider analysis;
- customer segments and win-back;
- campaign suggestions;
- review/feedback recovery;
- multi-location/brand comparison;
- operational anomaly alerts.

## Haccora

Customer positioning: food safety, FSA/EHO inspection readiness, HACCP/SFBB-style digital controls and evidence management. Do not claim FSA approval or promise a Food Hygiene Rating.

Dishbee integration events include:

- checklist completion;
- waste records;
- supplier receipt/traceability signals;
- allergen changes;
- future temperature/sensor events;
- incidents/corrective actions;
- staff training/expiry;
- cleaning/equipment checks.

Hive must preserve company/vendor isolation while allowing authorised venue-level oversight of shared compliance controls.

## Shared Omniqora engines

Already represented/built across the current Omniqora mainline/this branch:

- SaaS Factory/control plane;
- identity/tenant/RBAC;
- CRM/Customer 360;
- Connect/communications;
- Voice;
- AI;
- Geo;
- Dispatch;
- Fleet;
- Tracking;
- Marketplace;
- Inventory;
- Payments abstraction;
- loyalty/rewards integration;
- Journeys;
- RFM/segmentation;
- Campaigns;
- Feedback/NPS;
- Analytics;
- Profitability;
- Automation;
- Documents;
- Forms;
- Search;
- Support/SLA;
- Notifications;
- Integration Hub;
- Connector runtime/mapping/reconciliation;
- delivery broker;
- promotions/referrals/memberships;
- scheduled/recurring orders;
- substitutions;
- vendor capacity/rush controls;
- commerce risk/disputes;
- non-cash store/gift/refund credit;
- security/operational/data-governance service layers.

## Jungleworks-style parity mapping

| Pattern | Dishbee / Omniqora |
| --- | --- |
| Yelo marketplace | Dishbee+ + Omniqora Marketplace |
| Tookan dispatch | Omniqora Geo/Dispatch/Fleet/Tracking |
| Tookan driver/agent | Omniqora Agent + Dishbee own-driver surfaces |
| picker/fulfilment | Dishbee KDS/Hive/pass + marketplace inventory |
| Hippo engagement | CRM + Connect + Journeys + RFM + Campaigns + Feedback |
| white label | SaaS Factory branding/domains/product connections |
| integrations | Integration Hub + connector runtime |
| analytics | Analytics + Profitability + Buzz |
| restaurant stack | Dishbee One |
| dark kitchen/food hall | Dishbee Hive |

## Enterprise/QITT-style gaps

Keep these horizontal in Omniqora rather than putting them into Dishbee+ UI:

- enterprise identity/SSO;
- API/middleware/integration management;
- ERP/HCM/ITSM adapters;
- security/audit/assurance;
- BI/data governance;
- operational/release assurance.

Provider catalogue entries are planning targets until the relevant commercial/technical relationship is actually approved.

## External go-live dependencies (not “missing code”)

The following cannot truthfully be marked complete by repository code alone:

- Uber Eats production partner/API approval;
- Deliveroo production partner/API approval;
- Just Eat/JET Connect production approval;
- Uber Direct commercial/API arrangement for the selected account model;
- Deliveroo Express commercial/API arrangement;
- Just Eat Go commercial/API arrangement;
- Stuart production credentials/terms;
- Deliverect/Otter/UrbanPiper partner credentials if used as bridges;
- Foodics/Dines/other POS credentials/partner acceptance;
- payment-provider live credentials and marketplace/platform onboarding;
- production domain/app-store release configuration;
- regulated pharmacy permissions/workflows where applicable.

These remain explicit certification/readiness gates and must never be represented as live merely because code/config placeholders exist.
