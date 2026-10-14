# Field Agent — controlled pilot (14 October 2026)

This source adds a mobile-responsive authenticated Field Agent workspace at /app/agent. It does NOT release native apps or run GPS in the background.

Drivers see only assignments tied to their authenticated user and explicitly linked dispatch agent. Administrators must link a verified existing tenant member to the correct agent record. Server functions and SQL RPCs separately recheck tenant, driver, assignment, entitlement and lifecycle transitions. GPS sharing is one-time and user-initiated.

Driver attestation records recipient name and note with verifiedByRecipient=false. It is NOT a recipient signature, photo, independent handover verification, PIN or payment confirmation.

This migration tightens inherited dispatch write policies and dispatcher SECURITY DEFINER RPCs to owners/admins so general tenant agents cannot change other workers' jobs. Existing external fleet or mobile workers stay on their separate authenticated service interface, which must be retested before activation.

Before any live usage: pass full migrations and RLS tests with an owner, linked driver and stranger; verify cross-tenant and other-agent denials; test on-device geolocation, connection loss, suspended users, two open jobs, revoked links, POD, stale timestamps and retained location information. Offline queue, automatic road navigation, traffic-aware ETA, background location and verified recipient POD are later phases. No production migration or product cutover occurs in this change.
