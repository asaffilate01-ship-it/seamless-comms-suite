# Lawquo SaaS Factory architecture

Lawquo is registered in Omniqora as a first-class **legal SaaS landlord**.

The international legal marketplace is not provisioned as a separate SaaS. It is a Lawquo system workspace and product surface. This keeps one product identity, one professional identity model and one set of product entitlements while allowing many firms, chambers, solo practitioners and clients to operate independently.

## Hierarchy

```
Omniqora SaaS Factory
└── Lawquo product
    ├── landlord (system)
    ├── marketplace (system)
    ├── firm (tenant workspace)
    ├── chambers (tenant workspace)
    ├── solo_practitioner (tenant workspace)
    └── client (client workspace)
```

The Lawquo product owns its legal-domain services. Shared capabilities such as identity, marketplace primitives, communications, analytics, payments and AI remain Omniqora services and are consumed through entitlements.

## Canonical source

The canonical Lawquo repository is `asaffilate01-ship-it/law-remix`.

The portfolio's older Veris/Lawquo sources are migration inputs only. Valid functionality can be absorbed into the canonical Lawquo product, but they must not be provisioned as a second Lawquo landlord.

## Product services

Required platform services:
- `lawquo.core`
- `lawquo.marketplace`
- `lawquo.verification`
- `omniqora.identity`
- `omniqora.marketplace`

Optional surfaces/add-ons:
- `lawquo.pro`
- `lawquo.chambers`
- `lawquo.client-portal`
- `lawquo.intelligence`
- Omniqora CRM, Connect, Analytics, Payments and AI

## Provisioning rule

Create the Omniqora tenant first and activate product `lawquo`. The tenant/product config then declares the Lawquo workspace type. Lawquo stores its own legal-domain records and uses the scoped control-plane connector for central product/entitlement state.

Marketplace membership is therefore a Lawquo capability attached to a professional/organisation workspace, not a second SaaS account.
