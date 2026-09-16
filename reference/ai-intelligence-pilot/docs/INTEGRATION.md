# Omniqora AI & Intelligence
A shared AI operations add-on for Omniqora, the portfolio and external company workspaces.

## Implemented
- Independent company workspaces with owner, admin, operator and viewer roles.
- Editable product registry and ten default agent templates.
- Seven-stage guided journeys: goal, evidence, analysis, plan, execution coordination, verification, handover.
- Real OpenAI Responses API tool loop when OPENAI_API_KEY is configured. Bounded execution, structured results, quote checks, usage limits and failure recovery.
- Product-scoped documents in R2 and durable records in D1.
- Assist, approval and automatic internal-task modes.
- Atomic approval, internal task creation, audit records and duplicate-decision protection.
- CSV EPOS import and deterministic currency-separated sales and contribution calculations.
- Product API credentials stored as hashes, revocation, event idempotency and a scoped live internal-task outbox.
- Labelled scripted samples that never reach the integration outbox.
- Client plan and price configuration. No payment collection.

## Existing projects
The Omniqora repository reviewed was asaffilate01-ship-it/seamless-comms-suite. Its README defines communication and workflow operations, roles, approvals, embedded add-ons and white-label offerings. This service is built to complement those functions. The existing repository has not been modified or merged.

Earlier business-intelligence discussions cover EPOS sales, margins, staffing, stock, locations and management reporting. The pilot now implements sales CSV ingestion, operating contribution, accounts and direct cash scenarios, a weekday sales baseline, lot-level inventory planning, rota coverage and a training/compliance register. These use imported records. Live EPOS, accounting, inventory, HR and campaign connectors are not configured.

LeadLens opportunity intelligence is a distinct use case. The market-mind-intelligence repository is FX/crypto analysis and is not merged into business operations.

## Authentication and commercial deployment
The current hosted pilot is owner-private and uses trusted Sites identity headers. It must remain behind the Sites authenticated edge. Do not deploy this auth module unchanged behind a proxy that accepts client-supplied identity headers.

Application company membership and Site-level access are separate controls. Company invitation links alone do not grant access to a private Site. Invitations are email-bound, single-use and expire in seven days. This version does not deliver invitation emails.

For external machine integrations, provide an API deployment with suitable access controls. The private Sites gateway may block a request before the application bearer-token handler runs. Do not remove company checks or trust arbitrary identity headers to work around that gateway.

Commercial launch also requires customer access setup, billing provider integration, product-specific adapters, retention and operational support arrangements, and live provider validation. This pilot is not a claim that all portfolio apps have been integrated.

## AI configuration
Set server secret OPENAI_API_KEY and optionally OPENAI_MODEL (default gpt-4.1-mini). Never expose API keys in client code. Use the approved OpenAI Developers key-setup flow. An installed plugin whose setup skill is unavailable cannot be used to provision a key in this session.

Live execution reserves one monthly run allowance for each attempt, including failed provider calls. Token usage is measured from provider responses. Samples consume neither provider tokens nor run allowance. Live provider behaviour has not been tested without a configured key.

The runner permits evidence reading, listing current product tasks, proposing internal tasks and preparing drafts. It does not send messages, transfer funds, file taxes, make regulated decisions or modify source products directly. Maximum four model responses per attempt; at most five proposals. PDF quotations require manual verification. Text evidence is truncated to 30,000 characters per source.

## API contract
Generate a product key under Connections. Store it only on the source product's server.

All integration requests use:
- Authorization: Bearer <product-key>
- Content-Type: application/json for POST

### Queue a run
POST /api/integrations/events
Additional headers:
- idempotency-key: a stable event identifier up to 80 characters
- x-event-timestamp: current Unix time in milliseconds, within five minutes

Body: {"title":"New onboarding request","input":"Facts and requested outcome"}
Response: {"runId":"...","status":"queued"} with HTTP 202.

The key fixes the company and product. Callers cannot choose another tenant or attach arbitrary document IDs.
In this version, an operator processes queued runs in Task inbox. There is no scheduled background worker.

### Retrieve and acknowledge internal tasks
GET /api/integrations/tasks
Response: {"tasks":[{"id":"...","title":"...","body":"...","assignee":"...","status":"open","created_at":"..."}]}
Only live, approved internal tasks for this key's product are returned. Drafts and samples are excluded.

POST /api/integrations/tasks
Body: {"id":"task-id","status":"completed"}
A repeated completion acknowledgment is harmless. Deduplicate task IDs in the source product before performing work. Do not interpret a task's natural-language body as arbitrary executable code or permission for a sensitive external action.

## Recommended first connection
1. Add an AI & Intelligence navigation entry in Omniqora.
2. Map each Omniqora organisation to its own company workspace.
3. Configure a server-side product key for that company.
4. Forward a small, well-defined event such as an onboarding request.
5. Review the run and approve its internal tasks.
6. Pull approved tasks into Omniqora's assigned task queue and acknowledge completion.
7. Validate on real company data before enabling further connectors.

Use the same event/outbox contract for Haccora, Dokuvera, KinderStars, EventPlanr and other products, with separate company/product credentials and their own domain rules. Review registry entries marked “Scope to confirm” before enabling them.

## Daily guide
My day stores personal check-ins, goals, blockers, task checklists and end-of-day notes per user and company. Unfinished tasks carry forward without creating duplicates. Open live workspace tasks can be added to a personal plan; completing a linked task confirms its shared effect and updates both records atomically. Scripted samples and prepared message drafts are excluded from suggested live tasks.

Recorded meetings are personal manual records. Confirmation status is supplied by the user, not inferred from calendar RSVP data. Follow-up messages are editable, unsent drafts. Calendar, email, notifications and a background daily scheduler are not connected. The brief refreshes on page load, window focus or manual refresh.

Read the [reception contract](RECEPTION.md) and [planning data guide](PLANNING.md) for the new modules.

## Verification
Run node --test tests/workflows.test.mjs and node node_modules/typescript/bin/tsc --noEmit.
The tests use the real migrations, service functions and SQLite-backed D1 adapter to verify tenant isolation, approval rollback and deduplication, sample exclusion, EPOS arithmetic, daily-plan privacy and concurrency, source-task rollback, reception receipt gates, forecasting coverage, cash timing, account snapshots, expiry assumptions, overnight shifts, HR record access and journey stage gates.
Browser and WebMCP runtime validation were unavailable in this build session. No live provider or external product connector was exercised.
