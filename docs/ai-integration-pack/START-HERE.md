# Add the AI & Intelligence modules to Omniqora

This package contains the complete source of the published Omniqora AI & Intelligence pilot, including the latest speech input, customer recognition and follow-up continuity work. It also includes the earlier agents, approvals, My day, reception, planning and portfolio cross-selling modules.

## Where to put it

1. Unzip this package.
2. Add the `omniqora-ai-intelligence/` folder to the root of your existing `asaffilate01-ship-it/seamless-comms-suite` repository as an isolated source folder.
3. Read `OMNIQORA-MERGE-GUIDE.md` and give `LOVABLE-MERGE-PROMPT.txt` to Lovable or the developer doing the integration.
4. Keep the existing Omniqora application and root configuration in place while the modules are adapted.

Adding the folder to GitHub stores the source; it does not by itself add working routes or connect the modules to the main app. GitHub's file-upload screen does not extract a ZIP: unzip first when uploading source files.

## Compatibility

The source in this package runs as the tested Sites/Vinext React pilot with Cloudflare D1, R2 and Sites identity. The existing Omniqora repository inspected in this conversation uses TanStack Start, React and Supabase. This is a full source handoff with an integration guide, not a ready-applied patch for that different runtime.

For a single Omniqora application, port the authentication, storage, SQL transactions and route handlers to the existing Supabase/TanStack structure. Alternatively, retain the AI service separately and implement authenticated server-to-server adapters. The supplied private Site URL is not an unrestricted public API, and its Sites identity headers must not be trusted on another host.

Do not copy the nested package.json, lockfile, app entrypoints or platform configuration over the existing app's root files. Do not apply the SQLite migrations directly to Supabase/Postgres.

## Included features

- Company workspaces, roles, product-scoped AI agents, evidence and approvals.
- Guided journeys, daily priorities, personal tasks and meeting records.
- EPOS/planning imports, KPI calculations, forecasts, cash scenarios, inventory, staffing and compliance views.
- Portfolio cross-selling rules and product integration contracts.
- Reception requests, order/booking acknowledgments, KDS acknowledgment tracking and pagination.
- Reviewed dictation for task, daily planning and reception forms.
- Audio-file transcription endpoint, disabled until the AI service is configured.
- Customer directory and exact international phone-number matching, with shared/withheld number handling.
- Linked reception history, previous human colleague, handoff notes and same-person follow-up preference.

## Current limits

Live AI calls require a configured server-side AI key. Browser dictation depends on browser and speech-service support. Live telephone answering, staff availability, warm transfers, callback scheduling and direct CRM/EPOS/accounting/HR synchronisation are not connected. Customer history currently means linked reception requests in the same company and product.

A request to speak to the same person records a preference; it does not transfer a live call. An order receipt is an assertion from the authorised source adapter, and a KDS acknowledgment does not prove the meal was fulfilled.

## Verification

The included source passed TypeScript checking, a production build and 63 automated tests before publication. The tests cover actual SQLite migrations with a D1 test adapter and mocked provider calls. No microphone hardware, carrier call, live AI transcription or live transfer was tested. This evidence does not substitute for verification after adapting the modules to Supabase.

No dependencies, build output, live customer database, API keys or Git credentials are included. Dependencies are specified in the source package and lockfile.

See `PACKAGE-MANIFEST.json` for the exact source revision and `SOURCE-SHA256SUMS.txt` for file checksums.
