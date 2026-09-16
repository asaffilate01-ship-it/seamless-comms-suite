# Integrating a SaaS

## Application contract

Add an authenticated endpoint in the SaaS backend that accepts `{question, mode}`. It must resolve user identity from the application's existing verified session. Never trust tenant, role or case IDs supplied by the browser without checking membership.

Provide `createKnowledgeHandler` in `adapters/shared-knowledge-client.ts` with an `authorise(request)` callback. That callback returns a server-only service credential, service URL, an authorised collection and any required jurisdiction/language. It returns `null` for unauthorised requests. The package intentionally does not invent the table names or auth helpers in your existing repos.

Choose a reader credential bound to the relevant project/customer and a narrow collection set. Use a separate writer credential only for document/relationship sync. The Python service's credentials file stores SHA-256 hashes; the source SaaS keeps the bearer token in its server secret manager. Never use a `VITE_` environment variable for that token. The request adapter supports Node/Deno-compatible Web APIs; it does not depend on a particular Supabase schema.

Use the supplied React panel with your SaaS endpoint:

```tsx
<KnowledgePanel endpoint="/api/knowledge/query" title="Ask your procedures" />
```

For a Supabase Edge Function, use the project's established authenticated request method or pass the signed-in user's session headers to the panel. This is the user's existing session token, never the shared service token. Apply your actual CORS and CSRF conventions at the SaaS endpoint. The core service intentionally exposes no browser CORS API.

This is integration source, not a drop-in deployment to an uninspected repository. Compile it with the application's TypeScript configuration and test session expiry, changed permissions, missing membership, source permissions and UI error states.

## Minimum additions by project

| Project | Document mapping | Relationship mapping | Rules and UI |
| --- | --- | --- | --- |
| Haccora | Approved procedures, equipment manuals, training records | Equipment, maintenance, incident and procedure links; only where evidence exists | Use customer/location collections as needed; manager review; add the panel to the existing dashboard |
| TaxNuvia | Published services and onboarding guides | Firm/staff/service/sector connections verified from their records | Separate public-directory and private firm/client collections; do not infer live availability; explicit jurisdiction |
| Lawquo | Authorised case documents and reviewed research sources | Case, issue, document and citation links with verified provenance | Case-scoped access, explicit jurisdiction, source currency and legal review remain in Lawquo |
| Omniqora | Authorised briefs/documents selected by product adapters | Operational links explicitly shared for the current task | Coordinate authorised work; do not aggregate unrestricted legal cases or customer data |

Product adapters should keep structured business facts in normal database queries when that is clearer. A named relationship or multi-table lookup does not automatically require GraphRAG.

## Source ingestion

1. Verify the source is allowed for the chosen collection.
2. Convert its text to the API format in `API.md`. PDF parsing and OCR belong in a later ingestion worker.
3. Send `POST /v1/documents/upsert`, using a stable source ID. Save the returned revision.
4. Repeat identical payloads safely after uncertain network outcomes. Changed content requires the current `expected_revision`.
5. Submit reviewed graph edges with an exact quote from a current source chunk and the current document revision. Large/cross-chunk quotes should be shortened to a valid supporting excerpt.
6. On source changes, update the document first, then rebuild its verified edges. Deleting/updating a source automatically invalidates old edges. Do not skip this because a source URL stayed the same.
7. On permission changes, revoke access immediately in the SaaS backend and move/delete affected documents if collection membership changed. In-flight requests use a retrieval snapshot; add cancellation/revalidation for stricter revocation needs.

## Before a customer pilot

Connect the real auth and source mappings, run real-provider evaluation, review data-handling/retention settings, and deploy through production hosting with appropriate ingress and usage limits. Demonstrate that two customers and two legal cases cannot retrieve each other's sources. A successful synthetic demo is useful engineering evidence, but does not complete these integration tasks.
