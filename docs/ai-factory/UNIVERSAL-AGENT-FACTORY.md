# Omniqora: SaaS Factory + AI Agent Factory + MCP Hub

Status: **source implementation / controlled design**, not live production connectivity.

## Architecture — extend, do not fork

The existing SaaS Factory is the authority for landlord, products, tenants, regions, white-label, brands, entitlements, subscription/billing and provisioning. The existing Omniqora Intelligence engine is the authority for AI use cases, agent runs, reviews, execution jobs and action proposals. The existing provider catalogue/bindings, RRCI, Connect, Geo, CRM, Creative Studio, migration factory and product bridges stay authoritative.

The AI Agent Factory adds:
1. Versioned universal and product-specific agent blueprints.
2. Searchable agent recipe UI in `/app/intelligence`; authenticated operators can register a template as an **assessed use case** for independent approval. This does not run the model or connect tools.
3. A cost-aware selection library that takes **verified, versioned model tariffs** and quality/region requirements. No guessed prices or made-up percentage savings.
4. A connector-family inventory and an authoritative public MCP Registry discovery URL. Catalogue entries do **not** prove a provider has an official MCP server.
5. A capability planner that refuses to mark configurations ready if the tool's capabilities are not independently verified and explicitly granted for that tenant/product.

```
Existing SaaS Factory (landlord / products / tenants / subscriptions / roles)
                            |
      product_connections + scopes + entitlements
                            |
      Omniqora AI Agent Factory (versioned recipes & approvals)
          |                   |                    |
  Existing Intelligence  Verified MCP/API Hub    AI Cost Router
   Jobs / RRCI / actions  scopes / credentials   verified tariffs / QoS
          |                   |                    |
          +------- policy-enforced execution runtime ---------+
                            |
  Source SaaS domain API only (no unauthorised direct DB writes)
```

## Product coverage

**Every SaaS**, including products not explicitly listed, automatically inherits universal executive briefing, CRM, HR, accounting, financial intelligence, marketing, creative, support, compliance, analytics and workflow-design recipes. Product-specific recipes supplement universal ones.

First explicit product packs: XpertJobs, Autohashi, Zivvo, Craftvaro, Gabley, TaxNuvia, Lawquo, Eventplanr, Dishbee/MealDeck/Cafe 1, Finvessa and accountancy products, Haccora, Kindelo, MoneyBridge/FastRemit, UniPathway/LessonAhead/StemCoach, Formation Genie, Merqano/Merqora and All-Road-Aid. Gabley's vertical is **not presumed**; its initial recipe is deliberately generic pending authoritative source mapping.

New products require only a product key + source adapter + permissions + blueprint overrides, not a cloned agent runtime.

## MCP programme: source and activation stages

Use the [official MCP Registry](https://registry.modelcontextprotocol.io/) for discovery (registry API and version schema are subject to change). Vendor API integrations can be wrapped as private MCP servers when no independently supported official server exists. Track both in the connector registry, but do not mislabel API-only integrations as native MCP.

For **each server/provider**, store and verify:

- Published identifier, publisher provenance, upstream version, source code or trusted distribution, license and maintenance/incident history.
- Tool-level JSON schema, effects (read/draft/write/payment/delete), delegated scopes, transport type, endpoint, region, data categories, rate/quota and expected cost.
- Tenant/product ownership and role-bound permissions; server-side OAuth, consent, token rotation, vault secret reference and revocation.
- URL/DNS/redirect allowlist, TLS, SSRF defences, sandboxing of local binaries, prompt-injection/data-exfiltration tests, tool-output sanitisation and egress controls.
- Webhook HMAC validation, event IDs, rate limits, replay protection, tool timeouts, retries, idempotency and audit receipts.
- Independent authenticated capability and live health probe; a registry listing or operator-entered status cannot activate a server.
- Human approval for financial transfers, payroll/tax submission, filing, posting, public marketing, cancellation, deletion, legal advice, recruitment selection, safeguarding or privileged-data export.

Roll out by sector **as independent connector packs**: CRM/sales, HR/recruitment, accounting/tax, banking/payments, communications, marketing, creative, document/knowledge, dev/cloud, hospitality/delivery, automotive, legal, education/childcare, analytics, commerce/logistics and compliance. Other sectors inherit the universal core.

## Model support

Candidate inference backends: OpenAI, Claude/Anthropic, Gemini/Google, Azure AI Foundry, Amazon Bedrock, and approved private/self-hosted models. **Do not assume provider accounts, API keys or MCP interoperability are operational.** Keep model invocation separate from tool calls.

An enterprise policy chooses which providers, jurisdictions, model versions, evaluation scores, data categories and retention policies are allowed for a tenant. For genuinely sensitive/regulatory workloads, only evaluated, region-allowed choices qualify. A cheapest model is not necessarily a suitable one.

### Cost optimisation

An approved pricing record must include provider, model version, currency, tariff version, independently verified date, uncached input cost, cached input cost if supported, output cost, capability/evaluation profile and region. Estimate:

```
cost = uncached_input_tokens × input_rate
     + cached_input_tokens × cached_rate_if_supported
     + output_tokens × output_rate
     + verified_tool_costs
```

All rates are per 1 million tokens; convert to currency minor units and round **up** for estimates. Exclude unverified/outdated tariffs. Select the least-cost **qualified** candidate under the requested run budget. Never compare tariffs in different currencies without an independently verified exchange rate.

Token savings design: selective/discovered tool definitions instead of thousands loaded into prompts, retrieval chunking, zero-copy deterministic calculations, permissions-aware caching, response compression where appropriate, reusable source citations, batching, simpler-model routing for proven small tasks, budget reservations and post-run reconciliation from actual provider receipts.

MCP *does not* eliminate LLM/API charges, and bad MCP setups can increase context tokens. Estimated savings and actual savings must be reported separately against an explicitly agreed baseline.

## One-click workflow contract — next gated implementation

The future one-click button must call a trusted, authenticated **source-aware job orchestrator**, not execute an arbitrary third-party MCP tool directly.

1. Resolve tenant, SaaS product, workspace, human actor and permitted data classifications from authenticated identity and source SaaS.
2. Fetch an approved version of the agent blueprint/use case. Resolve allowed actions/connector IDs from server-side policy.
3. Require entitlement, verified connector, approved region, current provider model evaluation, tariff, reserve of the forecast upper-bound cost, rate/quota and max-step policies.
4. Retrieve only the minimum permitted tool schemas at runtime; treat tool output as untrusted.
5. Queue a versioned run with idempotency key and per-run cost limit. The existing `ai_agent_runs`, `intelligence_jobs` and `ai_action_proposals` should remain the canonical run/action ledger.
6. Workers recheck authority **before each external action**, especially after a human approval pause. Each action request includes expected effect, rationale, target, cost and revocation/expiry.
7. Deliver results, citations, errors and audit receipts to the SaaS's own dashboard/WhatsApp/email only with the customer's permissions and opt-in.
8. Compare forecast to actual provider-token and tool-billing receipts. Release unused budget; publish per-tenant/product/agent profitability and margins.

**Important:** the current feature branch stops before steps 3–8 are wired end-to-end. Registering the agent use case is not a one-click action execution. This guard is intentional until migrations, hosted workers, provider credentials, cost ledger and negative tests have been certified.

## Priority implementation sequence

1. **Catalogue and UI** — done in this branch. Confirm product-to-vertical keys and map source-backed capabilities to the existing `provider_catalogue` and `product_provider_requirements` entities.
2. **MCP server inventory** — add trusted registry-sync worker with pagination, provenance verification, never auto-connect, approval workflow and provider health tests. Rate-limited, no untrusted package execution at import time.
3. **Credential/connectors** — implement vault-backed account linking/OAuth per tenant and granular tool scopes; use supported vendor API adapters as fallback; stage one sandbox MCP server per major category.
4. **Model adapter + cost** — production worker chooses among real tariff/evaluation records, reserves budget atomically, executes bounded jobs, settles on provider receipts and records actual usage.
5. **Reusable one-click workbench** — agent creation wizard, task templates, schedules, triggers, human approval inbox, agent logs, compliance audit, notifications and dashboards; source-specific adapter testing.
6. **Pilot then scale** — run positive and adversarial staging cases for Dishbee, XpertJobs, accountancy and Zivvo. Confirm tenant separation, HR fairness/human oversight, payments guardrails, financial/posting restrictions, PII handling and real billing. Roll out to all remaining SaaS products using versioned capability packs.

## Deployment gates

No production migrations, API credential setups, model charges or customer data changes are part of this source branch. Existing public site and SaaS product runtimes remain unchanged unless the feature is reviewed, merged, tested, deployed and explicitly enabled. Follow `docs/OMNIQORA-CONSOLIDATED-READINESS-2026-10-04.md` for production release checks.
