# CricLume → Omniqora Intelligence: governed cricket vertical

**Delivery:** six domain-specific blueprint definitions, plus controlled integration
source in the independent CricLume repository. This catalogue is **not an active
production tenant, model worker or MCP installation**.

## Canonical references

- Source: `asaffilate01-ship-it/app-teaser` (CricLume)
- Omniqora productKey: `criclume`
- Factory inventory: `src/modules/control-plane/portfolio-factory-registry.json`
  already includes CricLume, with `tenantProvisioning:not_activated`.
- Omniqora API: `POST /api/platform/intelligence`
- CricLume server caller: existing Lovable-connected Supabase Edge Function
  `omniqora-intelligence`, not a browser API call.
- Product entitlement: `omniqora.intelligence-runtime`.

## Agents registered

| Blueprint | Source capability | Mode | Steps |
| --- | --- | --- | --- |
| `criclume.match-insights` | `criclume.matches.aggregate.read` | read_only | 3 |
| `criclume.batting-coach` | `criclume.matches.aggregate.read` | draft | 3 |
| `criclume.bowling-coach` | `criclume.matches.aggregate.read` | draft | 3 |
| `criclume.fielding-review` | `criclume.matches.aggregate.read` | draft | 3 |
| `criclume.training-plan` | `criclume.matches.aggregate.read` | draft | 3 |
| `criclume.match-analyst` | `criclume.matches.aggregate.read` | draft | 5 |

No human/player identities, birth dates, medical details, freeform scorer notes
or video/audio are included in the initial boundary. Scoreboard aggregates are
source data; Omniqora never edits them. Named-player and video intelligence
would be a separately consented and reviewed future capability.

## Authentication and tenancy

CricLume calls Omniqora with an **operator-provisioned service credential**
of the form `Bearer <keyId>.<secret>`. The Omniqora
`platform_service_credentials` row must be active, unexpired, and scoped to:
- exactly one `criclume` product identity per approved organisation→tenant map;
- `intelligence.run.start`, `intelligence.run.read` capabilities only.

The request contains `tenantId` from a backend-only, independently approved
mapping. Both `run.start` and `run.get` check that the tenant and product
match the credential and its `omniqora.intelligence-runtime` entitlement.
Do not use a single unscoped credential for the entire cricket customer base.

CricLume owns its own audit and idempotent request ledger and presents only
human-reviewed summaries, with source IDs for traceability. A queued job is
not completed model execution. Do not infer available model/provider connections
from a catalogue entry.

## Costs and agentic execution

The current generic `run.start` endpoint creates an `ai_agent_runs` /
`intelligence_jobs` record. The Agent Factory's separately governed budget
reservation path must be validated before allowing real paid jobs: approved
use case, live tested model/provider credentials, independently reviewed tariff,
regional compliance, per-run and monthly budget, atomic reservation, worker
execution and actual receipt settlement. Model selection prefers the cheapest
verified capable model, not a fictional rate.

Do **not** permit the AI agent to publish a scorecard, award league points,
change a match score, contact a child, run biometric recognition or mutate
a source club's record. Any future MCP tool would need independent verified
registration, exact source-only read scopes, revocation and human approval
for consequential actions.

## Pilot gate

1. Verify the correct CricLume Lovable-linked Supabase project and apply only
   reviewed, additive migrations there.
2. Approve and provision actual Omniqora tenants; no automatic customer creation.
3. Test one staging club end-to-end with owner and coach, and a second club
   attempting to cross-read the first club's match.
4. Verify privacy-minimised payload, duplicate queued-run handling, provider
   outages, budget/usage receipts and status polling.
5. Enable source-side feature flag only after Omniqora budget and worker
   credentials are demonstrated. Production remains disabled by default.

Do not delete or migrate CricLume's source scorer, media, event history or
Lovable Supabase connection. Omniqora is an **intelligence service**, not a
replacement cricket scoring database.

## Phase 2 budget safeguard and live handshake (16 October 2026)

**Cost-control fix:** the existing generic `run.start` endpoint writes an
`ai_agent_runs` and `intelligence_jobs` row without calling the Agent
Factory's atomic `queue_budgeted_ai_agent` reservation function. Until an
approved service-credential admission API exists, the generic endpoint
**rejects** product `criclume` with
`BUDGETED_ADMISSION_REQUIRED` (HTTP 409), regardless of who configured
the credentials. Other products' existing behaviour is not changed.

**Cost-free readiness check:** a scoped service may POST:

```json
{"operation":"connection.verify","tenantId":"<approved Omniqora tenant UUID>","productKey":"criclume"}
```

with an active platform-service credential explicitly containing capability
`intelligence.connection.verify` for that exact tenant and product. The
handler verifies scope, credential status/expiry, and
`omniqora.intelligence-runtime` entitlement. Successful response states
`connection:"verified"` and **`modelExecutionReady:false`**. This proves
a real no-cost access path *only*, not provider readiness, actual inference,
a model tariff, an MCP tool or a deployed budgeted worker.

CricLume's existing Lovable-linked Supabase remains the source database;
it stores independently approved club-to-Omniqora mappings and a read-only
history. The source now offers six deterministic coaching discussion
previews that consume zero model tokens. Historical AI reports are labelled
stale after scoring changes and cannot silently override a newer result.

### Required next gate: budgeted service admission

Implement a new, reviewed server-to-server budgeted request API that:

1. Authenticates a scoped CricLume service credential and validates active
   tenant/product entitlement, correct source match and independently
   approved `criclume.*` agent use-case blueprint.
2. Atomically uses **the same** approved model tariff, capability/region
   assessment, budget reservation, idempotency and monthly limits enforced by
   `queue_budgeted_ai_agent`. No trust in caller-provided rates/costs.
3. Binds the reservation and job to a trusted, minimised match snapshot
   version. Service auth must not impersonate a browser `auth.uid()` or
   skip independent review merely to get through an existing SQL function.
4. Enforces max steps, source-only read scopes, revocation, receipt-based
   settlement and safe cancellation in the authorised worker.
5. Verifies actual receipts against costs, adversarial cross-tenant tests and
   two pilot clubs before turning on paid model generation.

No default-on flag or wildcard access can bypass the above. Never
manually enable a provider for CricLume by editing the generic route.

## Phase 3 — scoped budget admission and worker quarantine (25 October 2026)

Implemented as reviewed **source**, not an activated tenant or billable model:

- `POST /api/platform/intelligence` now accepts
  `operation:"run.start.budgeted"` for **`productKey:"criclume"` only**.
  Only a platform service credential scoped to the exact tenant/product and
  capability `intelligence.run.budgeted` may call it. Connector `oqcp_`
  credentials, browser JWTs and arbitrary model/tool selections cannot.
- `20261025090000_criclume_budgeted_admission_v1.sql` adds operator-owned
  `criclume_ai_pilot_controls`, independently approved
  `criclume_ai_source_bindings`, and an append-only admission receipt ledger.
  All are service-role-only with forced RLS. No tenant or funding is seeded.
- A valid admission requires active product/entitlement, approved unexpired
  source/tenant binding, independently reviewed cricket blueprint, exact
  aggregate-only source schema, pilot worker-readiness proof and quotas.
- Omniqora selects the cheapest *currently approved* qualified text model
  using a verified provider binding and reviewed tariff in the tenant's
  **own country and currency**. No exchange-rate assumptions, guessed
  prices or model chosen by the caller are accepted.
- A single database transaction locks the monthly AI budget; checks the
  per-run/monthly/use-case caps and idempotency; creates
  `ai_budgeted_run_reservations`, `ai_agent_runs`,
  `intelligence_jobs` and a CricLume-specific source admission receipt.
- `criclume.budgeted.readonly` jobs are excluded from
  `claim_intelligence_jobs_for_scope`: the general-purpose model worker
  cannot grab them. A dedicated read-only, usage-reconciling worker still
  needs a separate certified release.
- `run.cancel.budgeted` is operator/service-only, requires separate
  `intelligence.run.cancel` permission, and atomically releases a cost
  reservation **only while the job has never been claimed or charged**.
  Processing or settled jobs need independent worker receipt reconciliation.

### Safe default and activation order

Both `criclume_ai_pilot_controls.enabled` and `worker_ready` default
**false**. They must not be enabled by merely merging the code. Confirm:

1. Source application's **existing Lovable-connected CricLume Supabase**
   migration, authenticated club and owner-scoped match record.
2. Hosted Omniqora Supabase migration lineage and RLS (the current
   connected account is not evidence that the correct project was deployed).
3. Separate approved source-club mapping and service credential with
   `intelligence.run.budgeted` (and a different
   `intelligence.run.cancel` operator key for cancelling).
4. Independent reviewed cricket `ai_use_cases` with only capability
   `criclume.matches.aggregate.read` and tested model evaluation/region
   evidence. No write tools, payment tools or cross-tenant retrieval.
5. Tenant budget, verified source snapshot and reliable return path for
   pending, stale and reviewed results.
6. **Dedicated worker** with bounded token execution, cancellation,
   real provider invoices/usage receipts, `settle_budgeted_ai_agent`
   reconciliation, revocation and emergency-stop. Do not mark
   `worker_ready` true before those tests pass.
7. Club pilot end-to-end, cross-tenant negative cases and backup restore
   evidence; only then set source
   `OMNIQORA_CRICLUME_PAID_ENABLED=true`.

Current `connection.verify` deliberately still reports
`modelExecutionReady:false`. A successful no-cost handshake is not a
billable execution capability. Reserved budget is **not** final actual spend.

### Remaining next work

Build and independently certify `criclume.budgeted.readonly` **worker
claim and settlement** with source revision revalidation and human sign-off
before enabling the front-end Generate button. Do not add or reuse a
generic unrestricted agent, arbitrary MCP tool executor or scoring-write
connector as a shortcut.
