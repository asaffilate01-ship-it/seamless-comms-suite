# MoneyBridge UK tenant → Omniqora Regulatory Audit (phase 1)
## Operator activation sequence
MoneyBridge is already registered under product key `fastremit` with draft blueprint `moneybridge-uk`. This migration adds an optional manually provisioned `omniqora.regulatory-audit` service. It DOES NOT create an operator, enable a feature, connect credentials or deploy a financial audit engine.
1. Deploy Factory migrations through `20261010110000` in staging and verify records exist.
2. Via reviewed Factory provisioning, create exactly one GB/GBP operator organisation and tenant, attach `fastremit` product with externally scoped workspace ID and a dedicated, isolated MoneyBridge database. Do not automatically activate a production tenant or equate customer/recipient with operator.
3. Verify tenant-product snapshot schema v4, scoped key, exact operator and product, country, entitlement validity and revocation; reject any cross-operator access.
4. Only after secure MoneyBridge-to-Factory read-only UAT, manually entitle regulatory-audit service. No payment, KYC or financial-record write authority.
5. Use MoneyBridge as evidence system of record; send only approved aggregate/non-sensitive counts and signed evidence-manifest references to the Factory.
6. Implement source-side immutable snapshots, reconciliation controls, daily and on-demand generators and isolated staff review UI, as tracked in MoneyBridge regulatory audit PR. The current audit draft utility is not a scheduled service.
7. Implement Factory workflow with distinct HMRC, FCA, internal templates, policies/versions, due dates, human maker-checker approval, artefact hash/storage and retention/access scopes. Do not claim automatic filing: external regulator integration requires separately verified permissions, current form schemas and explicit final approval.
8. Validate two-operator data separation, missing-source fail-closed behaviour, webhook duplicates, clock cutoffs, regulatory eligibility and traceable evidence replay before pilot.
## Current delivery boundary
**Merged:** initial MoneyBridge product / advisory connector.
**This proposed change:** optional Factory service catalogue + blueprint registration, default off.
**Not done:** runtime tenant binding, financial evidence adapter, live daily scheduler, reporting UI, immutable regulatory evidence packs, approved HMRC/FCA submission and compliance certification.
