# Automotive data sources and API acquisition register

This register separates **authoritative public APIs**, **partner APIs**, **commercially licensed provenance/valuation data**, and **source-system feeds**. Omniqora should not hard-code one commercial supplier where equivalent licensed suppliers may be substituted.

## UK

| Need | Preferred source | Access to obtain | Omniqora module |
| --- | --- | --- | --- |
| VRM vehicle identity, tax/SORN, first registration, engine/fuel/emissions, export and V5C issue data | DVLA Vehicle Enquiry Service | DVLA VES API registration/API key | Vehicle Intelligence |
| MOT tests, result, mileage, failures and advisories | DVSA MOT History API | Register with DVSA; OAuth client credentials + API key | Vehicle Intelligence / Mileage |
| Safety recall information | DVSA recall/MOT ecosystem and manufacturer sources | Confirm consumer/read entitlement; manufacturer fallback | Vehicle Intelligence |
| Outstanding finance | Licensed provenance provider | Commercial API agreement | UK Provenance |
| Police stolen marker | Licensed provenance provider | Commercial API agreement | UK Provenance |
| Insurance write-off/category | Licensed provenance provider | Commercial API agreement | UK Provenance |
| Salvage/history markers | Licensed provenance provider | Commercial API agreement | UK Provenance |
| Keeper/plate/mileage enrichment | Licensed provenance provider / DVLA data sharing where eligible | Commercial agreement / DVLA data request depending field | UK Provenance |
| Current retail/PX valuations | Auto Trader Connect preferred | Partner onboarding and production go-live | Valuation |
| Supply/demand/market condition/retail rating/days-to-sell/confidence-of-sale | Auto Trader Connect Vehicle Metrics | Partner onboarding and production go-live | Market Intelligence |
| Historic/trended valuation | Auto Trader Connect Valuations API | Partner onboarding | Valuation |
| Finance quotes, eligibility, application/lender workflow | Codeweavers | Commercial integration/API credentials | Finance Adapter |
| Digital service history | OEM APIs or licensed multi-OEM aggregator | OEM/aggregator agreements | Service History |
| VIN-level factory build/options | OEM/build-data aggregator | Commercial/OEM API agreement | Factory Specification |
| Seller/dealer verified photos/video | Dokuvera adapter | API agreement/credentials | Verified Media |
| Visible condition/photo completeness/change detection | Vision provider | Provider credentials/model deployment | Vision Inspection |
| Replacement/repair parts | SparesGrid | Internal/partner API | Parts Intelligence |

### UK provenance supplier procurement
Run a commercial/API evaluation of at least two providers. Required contract fields:
- finance agreement marker and finance-provider reference fields permitted for resale;
- stolen marker;
- MIAFTR/write-off category or equivalent licensed insurance-loss data;
- salvage markers;
- mileage discrepancy/history;
- plate/VIN identity history;
- import/export markers;
- keeper counts where licensed;
- response SLA, batch/API limits, cache/storage rights, derivative-report rights and end-customer display rights.

Candidates can include CAP HPI, Experian Automotive, MotorCheck/MotorScan or another UK licensed vehicle-provenance provider. Selection is commercial and contractual, not architectural.

## Japan / Autohashi

| Need | Preferred source | Access to obtain | Omniqora module |
| --- | --- | --- | --- |
| Live auction inventory/lot/chassis/model code | Autohashi auction/export partner feed | Existing/new commercial feed agreement | JDM Intelligence |
| Auction sheet, grade, inspector comments and condition map | Autohashi licensed auction feed | Auction/export partner permissions | Auction Sheet AI |
| Original auction photographs | Autohashi licensed auction feed | Image/data rights in partner agreement | Verified Media / Vision |
| Current bid/hammer/result | Auction/export partner feed | Commercial permission | JDM Intelligence |
| Historical auction appearances | Licensed Japan history API | Commercial API agreement | JDM History |
| Historical grade/mileage/accident/repair flags | Licensed Japan history API | Commercial API agreement | JDM History / Mileage |
| Japanese recall campaigns | MLIT published recall information + OEM confirmation | Public source / manufacturer validation | Vehicle Intelligence |
| Electronic inspection/registration certificate data | MLIT electronic vehicle inspection certificate API where eligible | MLIT application/approval | Vehicle Identity |
| Export/Shaken document extraction | OCR/document provider | Commercial API | Document Ingestion |
| Factory options/specification | OEM/catalogue/build-data provider | Commercial/OEM agreement | Factory Specification |
| UK landed retail valuation | Auto Trader Connect / UK valuation provider after normalization | Partner API | Valuation |
| UK finance after registration | Codeweavers | Commercial API | Finance Adapter |

### Japan history API candidates
Candidates to assess include GlobalVIN, Carcheck.jp, TheCarApi/CarStack-type feeds or another B2B provider with explicit rights for:
- Japanese frame/chassis lookup, not only 17-character VIN;
- auction sheet and original photos;
- prior auction appearances;
- mileage history;
- grade history;
- accident/repair flags;
- hammer/final prices;
- API redistribution/white-label rights.

Autohashi's authorised live auction feed remains the primary source for vehicles being actively sourced.

## Sources we should NOT infer
Do not turn absence of a record into a guaranteed clear result. Each passport field stores source, checked-at time, status and confidence. AI-visible damage is an observation, not mechanical/structural certification. Recall range matching may require OEM confirmation. Service-history completeness varies by manufacturer.

## Acquisition order

1. DVLA VES.
2. DVSA MOT History.
3. UK commercial provenance API.
4. Auto Trader Connect Valuations + Vehicle Metrics.
5. Codeweavers.
6. Dokuvera verified-media API.
7. Autohashi live Japanese auction feed.
8. Japan auction-history API.
9. Factory-build/specification provider.
10. OEM/multi-OEM service-history provider.
11. Vision provider.
12. MLIT/electronic registration access where justified.
13. SparesGrid parts APIs.

This order gives Zivvo a useful UK intelligence product quickly while allowing Autohashi JDM intelligence to use the same vehicle/passport/evidence architecture.
