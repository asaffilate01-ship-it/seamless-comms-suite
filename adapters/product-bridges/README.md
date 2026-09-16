# Server adapters for the current Omniqora host

Use `createProductBridge` from `client.mjs` only on the source server. It never accepts tenant, role or source context directly from a browser. Supply `resolveAccess(actor, resourceId)`, which must authenticate the source user and load the currently authorised record collection. Return `tenantId`, `scopeId`, integer `revision`, `contract`, and permission-filtered `context`. Return nothing/throw when access is revoked. Repeated requests need a stable `eventId` (idempotency key); change it only when the request or context revision intentionally changes.

The adapter checks access before sending and again before returning a result. It does not publish, send, file, charge, refund, approve compliance or change source records. The source app must present the result for its own review.

| Source | Contract / adapter mapping |
|---|---|
| SparesGrid | Existing source routes may call `/api/integrations/gateway` directly. Their `{tenantId,question,context,policy}` shape is supported. Separate binding/key per source tenant. Vision requests currently fail explicitly. |
| Lawquo | `lawquoDraft({actor,resourceId,scope,eventId,validateDraft})`; `resolveAccess` also returns authorised `sources`. Pass the source `validateOmniqoraDraft` function, exact firm/case/request/kind/revision, and use a stable request ID. Metadata is sent before evidence. Source context revision must change whenever facts or permissions affecting the evidence change. |
| TaxNuvia finder | `draft` with `contract:'taxnuvia_matching'` and the existing `toPrivacySafeAiInput(brief, candidates)` as `context`. Run only after source eligibility checks. Feed returned `matches` through existing `mergeAiRanking`; preserve its rules fallback and client shortlist limit. |
| EPOS / Dishbee | `contract:'epos_report'`, context includes `period_start`, `period_end`, ISO currency, `gross_sales` before discounts/refunds, `refunds`, `discounts`, `cost_of_goods`, and `source_ids`. Amounts must have the same tax basis/currency/period. Scope to the authorised branch. |
| Standalone Business360 | `contract:'business360_brief'`; share approved business/departments/stakeholder/process/metric facts through `context` with `source_ids`. No automatic personnel/payroll export. The shared runtime already supports company intake and downstream planning independently. |
| Other registered products | `contract:'generic_draft'`; question plus explicitly scoped context/source IDs. Product-specific permissions and authoritative record mapping must be implemented in that source before use. A generic bridge does not supply missing domain rules. |
| Haccora | Register the native signed webhook destination described in `docs/ecosystem/INTEGRATION.md`; no browser key. Only notification metadata is accepted by that path. |

See `docs/ecosystem/INTEGRATION.md` for central binding configuration, endpoints, RLS, live activation requirements and the complete recovered source registry. These adapters do not provide automatic cross-app SSO or share permissions by matching email addresses.
