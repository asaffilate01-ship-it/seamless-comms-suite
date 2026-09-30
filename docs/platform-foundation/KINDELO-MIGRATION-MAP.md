# Kindelo landlord, variants, tenants and legacy migration map

## Canonical product family

The current brand is **Kindelo**.

Omniqora product hierarchy:

```text
Omniqora
└── Kindelo                         product: kindelo
    ├── Kindelo UK                  product variant: kindelo-gb
    │   ├── Kindelo-operated UK agency tenant
    │   └── future white-label/partner agency tenants
    └── Kindelo Germany             product variant: kindelo-de
        ├── Kindelo-operated Germany agency tenant
        └── future white-label/partner agency tenants
```

The parent landlord owns the common product definition, UI/workflows and add-on catalogue.
Country variants inherit that definition and override only country/locale/regulatory/provider/branding configuration where possible.

## What is a tenant?

A tenant is an independently operated childcare agency/business that needs its own:

- staff and roles;
- branding/domain;
- locations/workspaces;
- billing/plan;
- provider integrations;
- compliance configuration;
- analytics/financials;
- module/add-on choices.

A childminder is **not** a tenant by default.
A parent is **not** a tenant.
A child is **not** a tenant.

### Marketplace identities

Inside each Kindelo tenant:

- agency staff -> tenant members;
- childminders/providers -> Syndriva marketplace vendors + vendor portal users;
- parents/guardians -> CRM people + customer portal users;
- children -> Childcare industry records linked to guardians;
- care services -> marketplace listings linked to booking services/resources;
- bookings -> Omniqora Bookings + marketplace booking link;
- payments -> Omniqora Payments;
- provider payout/commission -> Syndriva marketplace;
- compliance/training evidence -> Childcare + Documents + Compliance.

Promote a provider organisation to a full tenant only if it needs independent staff administration, branding, billing, integrations/compliance policy or its own downstream provider marketplace.

## Default Kindelo modules

Core:

- CRM;
- Syndriva Marketplace;
- Childcare industry layer;
- Bookings/Scheduling;
- Payments;
- Connect;
- Compliance;
- Documents;
- Forms;
- Automation;
- Notifications;
- Search;
- Analytics;
- Intelligence;
- Geo;
- Mobile;
- Support.

Optional add-ons:

- AI Reception;
- Financials;
- Marketing;
- Sales;
- Journeys/RFM;
- Feedback;
- Loyalty/Zoryn Rewards;
- Voxentri Creative.

Optional modules are inherited by UK/Germany and can be enabled per tenant without a code fork.

## Country variants

### Kindelo UK — `kindelo-gb`

Region pack: GB  
Locale: en-GB  
Currency: GBP  
Regulatory profile: configurable UK childcare-agency profile.  
Use Compliance packs/evidence workflows for the current UK/Ofsted/CMA requirements rather than hard-coding rules into Kindelo application code.

### Kindelo Germany — `kindelo-de`

Region pack: DE  
Locales: de-DE, en-GB  
Currency: EUR  
Regulatory profile: configurable German childcare profile.  
Local/state/municipal rules should be versioned regulatory/provider packs. Do not fork the Kindelo codebase for each authority.

The legacy Germany-specific `jugendamt_*` and `kita_*` concepts become Kindelo Germany vertical extensions layered over common Childcare/CRM/Compliance modules.

## Existing repositories

No live repository/database is changed by the Omniqora family registration.

### Operational source candidate

`asaffilate01-ship-it/kinderstars-childcare-saas`

This is the newer operational codebase and contains later go-live, verification, release, screening and mobile hardening.

Use it as the first source adapter for the UK operational migration.

### Localisation/Germany source

`asaffilate01-ship-it/kinderstars`

This contains broader localisation including German and Germany-specific entities such as:

- `jugendamt_lookups`;
- `jugendamt_ready_assessments`;
- `kita_partners`;
- `kita_referrals`.

Use selected domain/localisation logic from this repository for `kindelo-de`, while moving common concepts into the shared Kindelo/Omniqora model.

The repositories can be renamed/consolidated later. Repository renaming is not required for platform registration.

## Legacy -> Omniqora entity mapping

| Legacy Kindelo/KinderStars concept | Target |
| --- | --- |
| `profiles`, `user_roles` | Omniqora Identity; staff become tenant members, parents customer portal users, childminders vendor portal users |
| `parent_profiles` | CRM people + customer portal user mapping |
| `children` | `childcare_children` + `childcare_guardian_links` |
| `childminders` | Syndriva `marketplace_vendors` |
| `childminder_profiles` | `childcare_provider_profiles` + public marketplace vendor/listing data |
| `availability` | Booking resources + availability rules |
| `bookings` | Omniqora `bookings` + `marketplace_booking_links`; source stays authoritative during shadow phase |
| booking payment fields | Omniqora payment intents/refunds with `context_type=marketplace_booking` |
| `shifts` | provider work schedule/booking-resource availability where equivalent; retain product-specific fields until mapped |
| `timesheets` | `childcare_attendance` when it represents delivered care; retain employment timesheets separately |
| `contracts` | Documents + Forms + placement/funding references |
| funding/eligibility fields | `childcare_funding_cases` and `childcare_funding_claims` |
| `certificates`, `cpd_records`, training records | `childcare_training_records` + Documents + Compliance |
| `compliance_documents` | Documents + Compliance evidence |
| `minder_verification`, `verification_checks`, `screening_orders` | Compliance assessment/evidence/provider integration records |
| `incidents`, `safeguarding_concerns` | restricted Compliance/Support cases; do not expose through general marketplace tables |
| `messages` | Omniqora Connect |
| `notifications` | Omniqora Notifications |
| `invoices`, `expenses` | Financials/vertical finance adapter; retain legacy authority until reconciled |
| `subscriptions` | tenant/customer billing adapter depending the actual subscriber model |
| Stripe customer/webhook tables | Omniqora Payments bindings/provider-event ledger |
| `referrals`, referral codes | CRM/Marketing/Journeys/Loyalty depending commercial purpose |
| `academy_*`, training-course catalogue | Kindelo vertical training/academy extension; not part of universal childcare core |
| `jugendamt_*` | Kindelo Germany compliance/local-authority extension |
| `kita_partners`, `kita_referrals` | CRM companies/relationships; marketplace vendor only where the partner itself supplies bookable care |

## Migration sequence

### Phase 0 — platform registration

Already represented in the Omniqora branch:

- `kindelo`;
- `kindelo-gb`;
- `kindelo-de`;
- parent/variant inheritance;
- family-aware landlord operators;
- inherited default/optional add-ons;
- Childcare industry layer;
- vendor/customer portal identities;
- marketplace-booking bridge.

No legacy data moves.

### Phase 1 — shadow adapter

Connect the current Kindelo source database through a service credential/adapter.

For every mapped object:

1. preserve the legacy primary key as `external_ref` / source metadata;
2. upsert the corresponding Omniqora projection;
3. record source revision/event identity;
4. never write back to the source app yet.

The existing Kindelo database remains authoritative.

### Phase 2 — dual read / comparison

Use Omniqora projections for landlord dashboards/search/reporting while operational writes still occur in legacy Kindelo.

Compare:

- parent/customer counts;
- childminder/provider counts;
- active listings;
- availability;
- bookings/statuses;
- payment totals;
- attendance;
- funding totals;
- compliance expiry/verification;
- notifications/messages.

Resolve every mismatch before cutover.

### Phase 3 — module-by-module authority

Recommended order:

1. landlord/tenant identity and entitlements;
2. CRM/customer portal;
3. provider/vendor portal;
4. Documents/Notifications/Search;
5. provider catalogue/search;
6. Bookings/availability;
7. Payments;
8. attendance/funding;
9. Compliance;
10. optional growth/Reception/Loyalty/Voxentri.

Do not switch all domains on one day.

### Phase 4 — Kindelo UI consolidation

Lovable can then render:

- one Kindelo UI shell;
- country/tenant brand config;
- UK/Germany terminology;
- agency staff portal;
- parent portal;
- provider portal;
- inherited add-on navigation.

Country differences should be configuration and regulatory/provider packs unless the underlying business process is genuinely different.

## Example tenant provisioning

### Kindelo-operated UK agency

```text
product       kindelo-gb
region        GB
locale        en-GB
tenant        Kindelo UK
modules       parent defaults + selected add-ons
domain        kindelo.co.uk / app host as configured
providers     childminders as marketplace vendors
parents       customer portal users
```

### Kindelo Germany

```text
product       kindelo-de
region        DE
locale        de-DE
tenant        Kindelo Deutschland
modules       same inherited core + selected add-ons
domain        German Kindelo domain/app host
providers     Betreuungspersonen / Kindertagespflege providers as marketplace vendors
parents       customer portal users
extensions    Jugendamt/Kita + DE compliance packs
```

### Future independent agency

Create another tenant under `kindelo-gb` or `kindelo-de`.

It receives the same core code and can have:

- its own brand/domain;
- its own provider list;
- its own parent/customer base;
- its own payment account;
- its own WhatsApp/telephony numbers;
- its own module/add-on selection;
- its own regulatory evidence;
- isolated data and RLS.

No new SaaS fork is required.
