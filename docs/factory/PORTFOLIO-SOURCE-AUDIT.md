# SaaS Factory source audit and development-agent rollout

**Scope:** iTechLounge / Omniqora portfolio engineering. **Status:** source audit and development tooling, not a release certificate. Last reviewed: 2026-10-15.

## System boundaries

- **Omniqora** is the authority for SaaS Factory catalogue, product/landlord/tenant identity, entitlements, connectors, approvals, orchestration, CRM, shared AI intelligence and platform events.
- **VOXENTRI (creative-studio)** owns creative campaigns, rights, production, publishing and creative-specific data. Omniqora must not duplicate its studios or access tenant content without a permissioned product adapter.
- **Individual product repositories** own their business logic, customer data, domain APIs, deployment and sector-specific obligations.
- **Development agents** (Codex, ECC, Agency Agents) operate against source and approved test environments. They are not Omniqora's customer-facing AI Agent Factory and receive no implicit tenant data, credentials or production permissions.
- Avoid copying the entire Omniqora control plane into each product. Integrate through versioned product contracts, scoped credentials, event adapters and explicit operator approval.

## Evidence snapshot — 15 October 2026

The draft integrated Factory work is in Omniqora PR #97, based on its source registry. That registry currently declares **88 product identities** (72 candidates, 16 established), **74 products with at least one repository reference**, **14 with no repository reference**, **77 distinct GitHub repository references**, and **17 tenant templates**, all explicitly marked **not_activated**. Counts come from the source JSON; they do **not** establish running sites, production integrations, real revenue or active tenants. Repository URLs may require separate access and validation.

Merging source-only catalogue changes does not activate tenants, payment providers or customer operations. The 14 unmapped product keys need a repo, explicit "concept only" classification, or a documented exception.

## GitHub visibility reconciliation — 15 October 2026

The authenticated GitHub inventory was paginated (100 repositories on page 1, 12 on page 2). With **all 112 accessible repositories**, the source reconciliation is:

- **77 of 77 distinct Factory registry repository references are accessible** through the linked GitHub account.
- **35 accessible repositories are not referenced by this Factory registry**, including digital-creations-hub (iTechLounge master site), Cafe 1 repos, Zoryn, and likely experiment/prototype or tenant-specific repositories. All require classification, not automatic SaaS provisioning.
- **14 of 88 product identities still have no repository mapping**. Some may be valid concepts without source; the registrar must explicitly classify them.

An early first-page-only comparison incorrectly flagged seven repository references as unavailable. That warning was cleared after fetching the second GitHub page. Repository visibility does **not** establish code quality, operational readiness or tenant activation.

Private-repository GitHub Actions checks across several products are currently failing without usable steps or logs, while selected public-repository checks pass. Verify the GitHub owner account's Actions minutes, payment method, spending budgets, and runner access before treating these as application code failures. GitHub documentation: https://docs.github.com/en/billing/concepts/product-billing/github-actions . Root cause remains unverified.

### Repeatable, read-only commands

From the branch containing the expanded registry:

    node --test verification/control-plane/portfolio-factory-audit.test.mjs
    node scripts/factory-portfolio-audit.mjs --strict
    node scripts/factory-portfolio-audit.mjs --markdown

An explicit optional GitHub check is also available:

    GH_TOKEN=YOUR_READ_ONLY_TOKEN node scripts/factory-portfolio-audit.mjs --github

Use a fine-grained, **read-only** token with access to the intended private repositories; keep it in the environment or an approved secret manager, never in Git. Without sufficient permissions, GitHub's 404 response cannot distinguish a deleted repository from a private repository the caller cannot view. A successful lookup confirms access only, not code quality or deployment. The default offline audit requires no credentials and makes no network calls.

The dedicated GitHub Action validates registry structure and uploads a safe JSON evidence artifact. It deliberately does not publish private values or activate anything.

## Portfolio GitHub Actions blocker triage

A separate **opt-in, read-only** helper classifies recent workflow outcomes without changing repository or billing settings:

    GH_TOKEN=YOUR_ACTIONS_READ_ONLY_TOKEN node scripts/factory-ci-diagnose.mjs \
      --repo asaffilate01-ship-it/dishbee-helper \
      --repo asaffilate01-ship-it/creative-studio \
      --repo asaffilate01-ship-it/kinderstars-childcare-saas \
      --markdown

Use a fine-grained token with **Actions:read** on the selected private repositories. Pass tokens via the environment, not command-line flags; never paste tokens into tickets. A maximum of 20 explicitly selected repositories prevents an unexpected portfolio-wide scan.

- **possible_pre_runner_failure:** a failed run ended within 15 seconds and the API exposed no steps. Check the run's **annotations**, owner Actions spending budget, invoices, payment method and runner assignments. This is *not* proof of a billing issue.
- **executed_steps_failed:** actual steps were observed; inspect the failing step logs and fix application/CI code.
- **workflow_passed:** verification passed, but production deployment, data isolation, provider activation and regulatory readiness remain separate gates.
- **workflow_skipped / cancelled_unverified:** not acceptance evidence.
- **check_unavailable:** missing token permissions, API rate limit or transient error; never treat as green.

The helper does not rerun jobs, bypass a billing restriction, contact arbitrary URLs, install tools or expose credential values. Run tests offline with \`node --test verification/control-plane/portfolio-ci-triage.test.mjs\`.

## Development tooling: Codex + ECC + Agency Agents

These are optional engineering assistants, not deployment dependencies. Do not install arbitrary agent packages automatically in CI or production; review and pin trusted upstream commits, extension permissions, hooks and MCP servers before installation.

1. **Codex** — repository-aware development, targeted changes, local test execution and PR preparation.
2. **ECC (Everything Claude Code)** — shared development skills, engineering checklists and optional verified workflows. Its Codex plugin is installed separately from the SaaS runtime.
3. **Agency Agents** — expert-role prompts for frontend/backend, product, design, testing and security. Its documented Codex conversion creates user-local agent definitions, not Omniqora business agents.
4. **GitHub** — code review, least-privilege CI, run evidence and protected releases.

### Development-agent contract

For every change, determine: (a) the canonical repository and default branch; (b) whether the proposed functionality is already built or on a draft PR; (c) which tenant/region/permission boundaries apply; (d) the exact existing test commands; (e) whether external provider credentials or licensing are required. Work on a dedicated feature branch. Preserve Lovable-generated histories and instructions in AGENTS.md. Never force-push or automatically merge. Do not hallucinate API availability or use unverified live credentials.

At minimum, propose a PR with:

- Scope and files changed, linked issue/requirements and existing-draft overlap.
- Before/after behaviour and mobile/accessibility effects for UI changes.
- Regression tests, static checks, screenshot/test evidence where appropriate.
- Authentication/RLS, cross-tenant isolation, secrets, rate limits, audit logging and privacy checks.
- Migrations with a rollback or safe forward-fix plan.
- External integrations classified **catalogued / sandbox verified / production verified / live**, with evidence for each promotion.
- Exact deploy/release checklist and known blockers.

Never use developer agents to authorise financial transfers, change regulated outcomes, send bulk outreach, expose customer data or deploy to production without separately approved and audited controls.

## Portfolio rollout sequence

1. **Blockers first:** inspect failed CI and production-monitor runs (Dishbee, Courier OS, Kindelo, EventPlanr). The initial GitHub API audit could read conclusions, but failed-step logs were unavailable; underlying causes remain unverified.
2. **Shared platform:** resolve Omniqora factory PR #97 review/CI and verify registry mappings; keep tenant activation and connector credentials gated.
3. **Creative Studio:** retain existing VOXENTRI production/render tests, standardise development-agent guardrails, and validate real provider/rights/approval flow.
4. **Product waves:** Dishbee/Cafe 1/MealDeck/ChefzHub; Kindelo/Haccora/Skillfinch; EventPlanr/Courier/Fleetora; Lawquo/TaxNuvia/Formation Genie/MoneyBridge; Merqano/Dulcis/Kalethon; UniPathway/STEMCoach; remaining products.
5. **Release evidence:** no "live" status until the product's actual deployment, required third-party credentials, payment settlement, monitoring, security gates and operational acceptance have been checked.

Treat an inventory record, passed static test or merged PR as **source evidence**, not a promise that a business is live.
