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
