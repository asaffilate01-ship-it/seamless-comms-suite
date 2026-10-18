# Audit + Phase 3 plan: "Hire an AI Employee" onboarding (read-only audit)

Scope: OmniQora-native 10-step onboarding modelled on the Dot-style infographic. No OpenAI Dot integration. Nothing was changed during this audit.

## 1. Repository state (observed)
- Remotes: `origin` = Lovable private code storage (git.private.lovable-gcp.code.storage/<project-id>.git), `secondary` = Lovable S3 mirror. The GitHub repo (asaffilate01-ship-it/seamless-comms-suite) is not a sandbox remote, so open PRs (incl. #97 and #72) cannot be listed from here. Confirm on GitHub before building.
- Branch: Lovable editing branch `edit/edt-9de25668-…`. HEAD `9db7cac` "Work in progress", parent `5f3cde2` (Zivvo dealer bridge). Working tree: only `bun.lock` modified (not by this audit).
- Latest migration: `20261018090000_zivvo_dealer_factory_bridge.sql`. Production application state of any migration was not verified.

## 2. What is implemented today
Canonical ledger (`20261003203000_omniqora_core_completion_v3.sql`): `ai_use_cases`, `ai_agent_runs`, `ai_agent_steps`, `ai_action_proposals`, `intelligence_jobs`.
- Use cases: register / assess / approve / suspend (`src/modules/intelligence/functions.ts`), shown in `/app/intelligence`.
- Templates: static blueprint catalogue `src/modules/agent-factory/catalogue.ts` + `planner.ts` (capability gating, verified-tariff cost routing; returns `design_only` if not verified). DB tables `agent_template_catalogue` / `tenant_agent_templates` exist in two older migrations (defined twice — overlap to reconcile, not extend blindly).
- Costs/budget (`20261012180000_mcp_budgeted_ai_factory_v2.sql`): `ai_spend_budgets`, `ai_reviewed_model_rates` (no seeded prices), `ai_budgeted_run_reservations`; RPCs `configure_ai_spend_budget`, `queue_budgeted_ai_agent` (atomic reserve + run + job, idempotent), `settle_budgeted_ai_agent` (service role only), `cancel_budgeted_ai_agent`.
- Approvals: separate-reviewer use-case approval; action proposals reviewed by humans; MCP setup requests reviewed at `/app/mcp-review`.
- Tool bindings: `mcp_setup_requests` (shortlist only — not installed), `provider_bindings` (platform kernel), legacy `ai_tool_bindings` (older `ai_webhook_core`). No MCP tool is ever called.
- Execution: queue only. `service.server.ts` exposes `job.claim` / `action.claim/finish` to an external service-credential worker. No in-app model call for Factory runs; the reference engine is a simulation. No worker is verified as deployed.
- Parallel ledgers that must NOT be extended: `public.ai_runs`, `ai_action_requests` (ai_webhook_core) and `business360.ai_runs`.

## 3. Gaps for named, tenant-created AI employees
- No `ai_employee` entity (name, role, avatar, owner, product, linked use case/template, status draft/testing/active/paused/retired).
- No persisted wizard draft (role, goals, tasks, business context, instructions/SOPs with versions).
- Connected apps: only MCP requests; no per-employee grant to a verified `provider_binding`/capability.
- No triggers/schedules (no cron/event definition tied to an employee).
- No dry-run mode distinguished from a real run; no test-case set.
- Review: no per-employee approval policy (which actions need a human); no go-live sign-off separate from author.
- Pause/monitor: runs can be cancelled but there is no employee-level pause that blocks new queueing.
- Reporting: no per-employee view of runs, spend (reserved vs settled), proposals, audit trail.
- No feature flag/entitlement specific to this experience; permissions/RLS do not yet exist for the above.

## 4. Smallest safe Phase 3 build
Principle: an AI employee is a configuration wrapper over an approved `ai_use_cases` row. Every run goes through `queue_budgeted_ai_agent` into the existing `ai_agent_runs` + `intelligence_jobs`. No new run ledger, no new provider records, no model or MCP calls.

Migration `supabase/migrations/2026102xxxxxxx_ai_employees_phase3.sql` (new tables, forced RLS, GRANTs, SECURITY DEFINER RPCs with tenant role checks):
- `ai_employees` (tenant_id, product_key, use_case_id FK, blueprint_key, display_name, role_title, status, created_by, approved_by, paused_at, paused_reason, feature version).
- `ai_employee_profile_versions` (immutable: goals, tasks, business_context, instructions, SOP refs, data classes, content hash; one active version).
- `ai_employee_capability_grants` (employee, capability key, provider_binding_id nullable, granted_by; grant only valid when the binding is independently verified — enforced in the RPC, never from a public MCP manifest).
- `ai_employee_triggers` (manual / schedule cron text / event key; enabled flag defaults false; no scheduler runs it in Phase 3).
- `ai_employee_test_cases` (input, expected checks) and dry-run results stored as `ai_agent_runs` with a `dry_run` mode flag in the run input, not a new table.
- Link column: `ai_agent_runs.ai_employee_id` (nullable) — only additive change to canonical tables.
- RPCs: `create_ai_employee_draft`, `save_ai_employee_version`, `grant_ai_employee_capability`, `submit_ai_employee_for_review`, `approve_ai_employee` (reviewer ≠ author, owner/admin), `pause_ai_employee` / `resume_ai_employee`, `queue_ai_employee_run` (checks status active or dry-run, not paused, delegates to `queue_budgeted_ai_agent`).
- Feature flag: new entitlement key `omniqora.ai-employees` checked in every RPC via `has_tenant_entitlement`, default off.

Source:
- `src/modules/ai-employees/contract.ts` (zod schemas, statuses, pure transition rules).
- `src/modules/ai-employees/functions.ts` (createServerFn + requireSupabaseAuth, calls RPCs only via `context.supabase`; uses `requireService`, `requireAdminRole`).
- `src/modules/ai-employees/HireWizard.tsx` — 10 steps: Role, Goals, Tasks, Business context, Connected apps (verified grants only), Instructions & SOPs, Triggers (saved disabled), Test (dry-run queued), Review & approval, Go live / pause & monitor.
- `src/modules/ai-employees/EmployeeMonitor.tsx` — runs, reserved vs settled spend, proposals, audit.
- Routes: `src/routes/_authenticated/app.ai-employees.tsx`, `app.ai-employees.$employeeId.tsx`; nav entry in `src/components/app/shell.tsx` shown only with the entitlement.
- Translations for 5 languages via existing i18n.
- Docs: `docs/ai-factory/AI-EMPLOYEES-PHASE3.md`; one AGENTS.md rule.

Tests:
- `verification/control-plane/ai-employees.test.mjs` (contract assertions on migration + transitions).
- `verification/control-plane/ai-employees-postgres.sql` run on a throwaway PostgreSQL with the full migration chain.

## 5. Definition of done
- Full migration chain replays clean on a throwaway DB; build, typecheck, `test:security`, Factory audit `--strict` and existing agent-factory tests green.
- Tenant isolation: tenant B member cannot read/update tenant A employees, versions, grants, triggers, tests or linked runs via table or RPC; viewer/agent cannot approve, grant or resume; anonymous calls denied; direct browser INSERT/UPDATE on new tables blocked.
- Approval: author cannot approve own employee; unapproved, paused, retired or unentitled employees cannot queue; pause blocks new queueing atomically.
- Budget: every queued run creates exactly one reservation + one `ai_agent_runs` + one `intelligence_jobs`; idempotency reuse with changed payload rejected; over-budget rejected.
- Malicious connector cases: grant referencing another tenant's binding, unverified/stale binding, revoked binding, capability not in blueprint, manifest-claimed capability with no probe, SOP text containing "ignore policy / call tool X" (stored as data, no grant created), injected cron string — all rejected or inert.
- No model, MCP or external call is made by any Phase 3 path; triggers remain disabled; no production migration, publish, or tenant activation.
- Later phases (not Phase 3): verified worker execution, scheduler, live connector OAuth/vault, outbound actions.

## Open points to confirm
- Open GitHub PRs touching agent-factory/intelligence (not visible here).
- Whether to reconcile the duplicated `tenant_agent_templates` definitions before Phase 3.
