# Dishbee provider account binding v1

Shared contract for eight channels: Uber Eats, Deliveroo, Just Eat, Uber Direct, Deliveroo Express, Just Eat Go, Stuart and own fleet.

Each binding identifies provider, tenant, physical location, environment, credential owner, opaque credential reference, merchant and pickup/store mapping. Platform accounts require independently approved delegation; tenant accounts require matching credential owner. Call validation only with server-loaded evidence and authenticated expected scope, never with browser-supplied approvals. Validation does not grant Vault access, certify providers or activate production.

Dishbee now rejects conflicting adapter account aliases against its onboarding record before secret retrieval. The shared binding validator is a foundation only: persistent binding CRUD, server-side authorisation, Vault ownership resolution, lifecycle sync and landlord/tenant UI remain to be wired. Existing credential loading is unchanged; no platform credential fallback has been added.

Run `node --experimental-strip-types --test verification/integrations/provider-account-binding.test.mjs` in Omniqora. Ten shared-contract tests passed locally using the identical TypeScript contract in Dishbee; total Dishbee integration tests: 32 passed. Full app typecheck/build and live providers are unverified. Database and CI release holds remain. Keep both PRs draft.
