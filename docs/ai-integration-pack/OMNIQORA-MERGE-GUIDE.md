# Omniqora merge guide

Target: `asaffilate01-ship-it/seamless-comms-suite`.
Source: the isolated `omniqora-ai-intelligence/` folder in this package.

## Preserve the existing app

Recheck the target repository's current README, AGENTS.md, dependencies, routes, Supabase schema and organisation membership policies before editing. The previous review found a TanStack Start/React/Supabase communication and case-management app. Preserve its inbox, WhatsApp, contacts, cases, roles, billing and existing add-ons. Work in a branch; no force-push or destructive schema replacement is required.

## Integration map

| Source | Purpose | Required adaptation in existing Omniqora |
| --- | --- | --- |
| `app/console.tsx`, feature view files, `components/` | AI operations UI and reusable components | Add nested authenticated TanStack routes and a navigation entry. Reuse the target design system; adapt imports and context. |
| `app/chatgpt-auth.ts`, `lib/server.ts` | Identity, membership, data access, mutations | Replace Sites identity with the existing verified Supabase session. Resolve organisation and role on the server. Replace D1 data access with Postgres/Supabase operations. |
| `db/schema.ts`, `drizzle/*.sql` | Complete SQLite schema and ordered migrations | Create new Postgres migrations, organisation foreign keys/indexes and RLS policies. Do not execute SQLite DDL on Supabase. |
| `app/api/**/route.ts` | Session and integration HTTP handlers | Port to authenticated TanStack handlers or Supabase Edge Functions using the project's existing convention. |
| `lib/runner.ts`, `lib/approval.ts`, `lib/policy.ts` | AI runs, permissions and review controls | Keep provider calls server-side. Preserve quotas, allowed tools, approval gates and idempotency in transactional Postgres/RPC operations. |
| `app/api/evidence/route.ts` | Evidence files | Use private Supabase Storage with organisation/product access controls and bounded downloads/uploads. |
| `app/my-day.tsx`, `lib/day.ts` | Personal daily planning | Preserve both organisation and user ownership. Completing linked source tasks must remain atomic. |
| `app/planning.tsx`, `lib/planning.ts`, `lib/analytics.ts` | Business metrics and scenarios | Reuse deterministic calculations, connect actual source imports, and retain missing-data and currency distinctions. |
| `lib/portfolio-*.ts`, portfolio components and opportunity endpoint | Cross-selling | Preserve scope/country/placement restrictions and avoid sharing customer data through public referral links. |
| `app/speech-input.tsx`, `lib/speech.ts`, `app/api/speech/route.ts` | Reviewed speech and transcription | Mount the provider in the main authenticated app, adapt form/context imports, and expose a server transcription endpoint. Keep explicit start/stop, review and insert. |
| `lib/phone.ts`, `lib/customers.ts`, `app/caller-lookup.tsx` | Caller recognition and context | Map canonical international numbers to real CRM customer IDs. Keep organisation/product scoping, ambiguous-number choices and explicit profile confirmation. |
| `app/receptionist.tsx`, `lib/reception.ts`, reception endpoints | Requests, source receipts and continuity | Map to the existing case/customer identifiers and staff directory. Preserve exact source references and retry handling. |

## Database and access rules

Use new, clearly namespaced AI tables where needed, reusing existing organisation/customer/user identifiers after an explicit mapping. The pilot uses string IDs; do not cast them to UUIDs without a mapping. Roles are owner/admin/operator/viewer; adapt to the main app's actual roles without widening permissions.

Enable RLS on new business tables. Scope all reads and writes to the authenticated organisation and, when applicable, product and personal user. The organisation in a request body cannot confer access. Service-role credentials must remain on the server; server-side paths that bypass RLS must perform equivalent checks.

D1 batch atomicity, SQLite `changes()`, `INSERT OR IGNORE`, JSON extraction and string dates need deliberate Postgres equivalents. Preserve revision compare-and-swap, unique idempotency keys, monthly quota reservations, approval/task/audit atomicity and invitation restrictions. Do not replace transactions with several independent browser requests.

The pilot keeps reception profiles separately. When connecting the real CRM, use a durable mapping from its customer ID to the reception profile; do not merge people solely by number. Shared numbers are valid. Caller ID matching is not identity verification. The pilot's reception history does not already contain the main CRM's complete order or case history.

## Speech integration

Browser dictation can be adapted without an app AI key where the browser supports it. It starts only on an explicit action, shows interim text separately and inserts only reviewed text. Cancellation, navigation and permission errors must stop listening and prevent late results from reaching another form or company.

The audio-upload endpoint needs a server AI key, model access and environment configuration. Preserve the 2 MB input limit, 45-second timeout, atomic per-company monthly attempt limit and no automatic retries. Never put provider keys in frontend build variables. The endpoint does not retain audio/transcripts; provider processing policies are separate.

## Returning customer and previous colleague

Keep the customer flow: incoming number -> candidate profiles -> confirmation -> relevant reception/case history -> ask whether this is a follow-up -> offer the previous human colleague -> save the caller's preference.

The pilot records `human_handler_id`, its name snapshot, `handoff_note`, and `preferred_handler_id`. Map these to the main staff directory. Team membership is not staff availability. Live availability, queues/extensions and warm transfer require a provider adapter. When that exists, offer waiting, a callback or another colleague if the preferred person cannot take the call, and give the next colleague the relevant context. A successful transfer must come from a carrier event, not generated text.

## APIs and live connections

Detailed payloads are in source `docs/INTEGRATION.md` and `docs/RECEPTION.md`; capability status is in `docs/VOICE-REVIEW.md`. Retain product-scoped hashed server credentials and fixed tenant binding. The timestamp header is a freshness check, not a carrier signature. A telephony bridge must verify the carrier signature before sending an event into the app.

If keeping a separate service, add a server adapter in the main app and configure a suitable protected machine-access ingress. Never expose product keys in browser code or treat the owner-private Site as a publicly accessible API. Sharing a navigation link does not implement SSO or synchronise data.

Keep existing order/payment/booking systems authoritative. Phone and online orders should follow the same accepted-order and KDS path. Do not let model text confirm payments, reserve inventory or bypass approvals.

## Completion checks after porting

- Existing Omniqora features and login still work.
- Two companies and two users cannot access each other's protected records.
- Approvals and task writes roll back together; duplicate events do not duplicate work.
- Missing provider configuration produces accurate unavailable states.
- Browser speech handles denied permission, cancellation and navigation safely.
- Shared/withheld numbers and a changed/removed colleague do not misroute a customer.
- Real source CRM IDs and records appear in the intended context only.
- Order/booking/KDS receipts remain source-gated and retry-safe.
- Test the actual Postgres migrations/RLS and adapted APIs; do not claim SQLite test results verify the new backend.
- Live calling remains labelled coming soon until inbound calls, failed transfers, callbacks and provider errors have been exercised with real connections.
