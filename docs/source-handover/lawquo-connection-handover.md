# Add to Omniqora: Lawquo connection handover

Save this file as `docs/lawquo-connection-handover.md` in the existing Omniqora repository, `asaffilate01-ship-it/seamless-comms-suite`.

This document specifies the next integration work. It does not install a working Lawquo connector. No Omniqora runtime code was changed in the Lawquo implementation.

## What goes into Lawquo

All 40 files in **Lawquo-Update-PR1.zip** belong in the existing Lawquo repository, `asaffilate01-ship-it/law-remix`, preserving the paths inside the archive. The same changes are already committed in [Lawquo draft PR #1](https://github.com/asaffilate01-ship-it/law-remix/pull/1), commit `740e6eb5708910b2b4f58f6c1094573eceeb274b`.

Merge that PR OR import the update files into the existing project. Do not do both. The archive is an update pack, not a complete standalone application. Compare against newer repository changes before overwriting existing files.

Lawquo owns the client/lawyer dashboards, enquiries, practitioner matching, engagement, case permissions, legal research, source verification, private drafts, client publication, email intake and case tasks. Its four migrations run in **Lawquo's Supabase project**. The existing deployment guide is `docs/lawquo-intelligence.md`.

The file `supabase/functions/_shared/lawquo-omniqora.ts` also belongs in **Lawquo**. It validates future Omniqora responses on the Lawquo side. Do not move it or the legal-domain, server, marketplace or webhook helpers into Omniqora.

## What goes into Omniqora now

Add this handover document only. Do not copy Lawquo's Supabase migrations, dashboards or Edge Functions into Omniqora. Once the Lawquo pilot works, implement the connection below against Omniqora's actual current backend and deployment.

## Connection to build

1. Add a Lawquo connection under Omniqora's integrations. Map each Lawquo firm to a separate Omniqora organisation and product credential. Store credentials only on servers.
2. Provide an authenticated machine endpoint. Preserve tenant checks and existing hosting access controls. Do not trust client-supplied identity headers or disable authentication to make a connection work.
3. Queue one scoped operation, `prepare_assessment`, with durable status, retry handling, a stable request ID and delivery acknowledgement.
4. Keep the initial event free of client narratives, raw emails and documents. If processing needs evidence, Lawquo must grant short-lived access limited to that case after checking assignment, ethical walls and the configured data-sharing arrangement.
5. Return a structured private draft with the same firm, case, request ID, kind and context revision. Lawquo authenticates the caller, rechecks current permissions, validates source identifiers and saves the draft for its own lawyer-review workflow.
6. Display operational states such as queued, processing, draft returned and failed. Test cross-firm access, revoked credentials, duplicate events, outdated evidence, retries and outages before activation.

The reviewed Omniqora pilot describes `POST /api/integrations/events` with a `title`/`input` body and product-scoped credentials. It also describes an internal-task outbox. Verify these routes against the target repository: the pilot service is separate and is not evidence that the production Omniqora repository already contains them.

## Version 1 operation envelope

```json
{
  "schema_version": 1,
  "operation": "prepare_assessment",
  "firm_id": "server-resolved-firm-id",
  "case_id": "server-resolved-case-id",
  "request_id": "stable-request-id",
  "context_revision": 7,
  "kind": "correspondence"
}
```

For the existing pilot's event shape, the title is `Lawquo draft preparation requested`, and `input` is this envelope encoded as JSON text. A returned draft echoes the envelope and adds `assessment`; its structure is defined by `Assessment` and `validateAssessment` in Lawquo's `supabase/functions/_shared/lawquo-domain.ts`.

Omniqora can coordinate work and prepare drafts. Legal approval and client publication remain in Lawquo. An Omniqora task approval must not accept an engagement, clear a conflict, release advice, send legal correspondence, move money or file at court.

## Prompt for the Omniqora development session

> Implement the Lawquo connection described in this handover in the existing Omniqora project. First inspect its real backend, authentication, organisation model and job lifecycle. Reuse existing infrastructure where suitable. Build organisation-scoped credentials, durable idempotent drafting jobs and a private draft return flow compatible with Lawquo's version 1 contract. Keep legal review and client publication in Lawquo. Do not import Lawquo database migrations or expose unrestricted case access. Report any required secrets, deployment steps and source-processing permissions separately from the implemented code. Do not describe the connection as live until both sides have been configured and tested together.
