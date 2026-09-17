# Voice, caller recognition and call-centre review

Reviewed 15 September 2026. This document distinguishes implemented reception features from future live telephony.

## What was checked

- This Omniqora AI & Intelligence Site: reception intake/settings, connector authentication, order/booking/KDS receipts, agent briefs, daily planning, workspace boundaries and environment configuration.
- Main Omniqora repository `asaffilate01-ship-it/seamless-comms-suite`, main tree `0d49bc85c4309c3b1160d0a10c15fe3e4aaa69c0`: complete tree, README, AGENTS.md, app functions, inbox, settings and mock data. The inbox calls WhatsApp conversation/message functions; case/contact operations use Supabase. No voice session, inbound phone webhook, speech-recognition or receptionist route was located in that inspected tree. A displayed sample number and static settings controls do not establish that a phone carrier is connected. No source changes were made to that separate repository in this review.
- Earlier Konnevia Voice proposals: standalone and Omniqora add-on, languages, departments/extensions, approved answers, transfers, voicemail/callback and call summaries. Earlier provider suggestions are proposals, not a verified service configuration. No separate Konnevia repository or live phone account was available for verification.
- The Site environment had no configured values. No OpenAI or telephony key, inbound number mapping or provider call session was available for a real-call test.

## Available in this release

| Capability | Behaviour |
| --- | --- |
| Reviewed speech input | Dictate daily priorities, issues, task/meeting notes, day reviews, agent briefs, reception instructions, request details and handoff notes. Select a language, explicitly start/stop, review and insert. Never submits the form automatically. |
| Browser speech | Uses the browser's recognition service where available. Eight locale choices: UK/US English, German, Urdu, Hindi, Arabic, French and Spanish. Service/language support varies. Stops on dismissal, workspace/navigation changes, hidden page or the 90-second session limit. |
| Audio-file transcription endpoint | Authenticated server endpoint with 2 MB file limit, model allowlist, 45-second provider timeout and atomic per-company monthly attempt allowance (default 100). Files and transcript are not stored by the endpoint. Requires an OpenAI key before use; unconfigured in this Site. Provider-side processing/retention is separate. |
| Customer directory and number lookup | Save confirmed profiles or synchronise from a source app using stable source customer references. Exact canonical international number matching, including 00-to-+ conversion, scoped to the company and product. No country guessing, suffix matching, automatic profile merging or voice biometrics. |
| Caller recognition | Enter a caller number and review candidate profiles. Shared numbers produce a choice; hidden/invalid/unknown numbers produce appropriate guidance. Staff explicitly confirm the profile before linking a request. A number match does not authenticate the caller. |
| Customer continuity | Up to 20 linked reception requests, source references and last recorded human conversation. This is reception history; the main CRM's full contact, order and booking histories are not synchronised yet. |
| Same-person preference | Record who actually spoke to the customer and their handoff notes. A returning caller can request the previous colleague. The saved request carries that preference without claiming availability, transfer or a booked callback. Removed team members cannot receive new preferences. |
| Reception readiness | Configuration and source receipt evidence are displayed separately. A configured key or historic receipt is not a live health check. |
| Reliable inbox and receipts | Product/status filtering and cursor pagination reach older records. Repeated matching order acceptance after KDS delivery is harmless; conflicting receipts are rejected. |

Browser recognition is not uniformly supported and some browsers send audio to a remote speech service: [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition). File transcription is a different operation from an ongoing telephone conversation: [OpenAI speech-to-text guide](https://developers.openai.com/api/docs/guides/speech-to-text).

## Returning-caller flow for the phone adapter — coming soon

1. Verify the carrier's webhook, resolve the dialled business number to the correct company/product, and take caller ID from the verified provider event. Treat caller ID as a candidate match, not authentication.
2. Look up the number. If hidden or shared, ask the caller for enough information to locate and confirm the correct profile. Do not read private case/order details aloud to an unidentified caller.
3. Ask whether this is a follow-up or a new issue. Retrieve the relevant case and the last human who handled it; the current pilot exposes reception history and recorded human context.
4. Offer: “You spoke with [name] last time. Would you like me to try them again?” Do not assume the customer wants the same person for every issue.
5. With the caller's choice, check current staff presence, working hours and the approved queue/extension mapping. A saved team member is not a live presence signal.
6. If available, make a warm transfer: give the colleague the confirmed customer, reason for calling, relevant case/order reference, previous commitments and what remains outstanding. Keep the customer connected while the transfer is attempted. Do not claim success until the carrier confirms connection.
7. If unavailable, offer to wait, request a callback from that colleague, or speak to another appropriate colleague with the same context. Get the caller's choice and availability; confirm a callback time only after a real scheduling service accepts it.
8. Handle transfer rejection, timeouts, out-of-hours and disconnected calls. Persist call/provider IDs, routing attempts, dispositions and minimal permitted notes so retries cannot create duplicate calls, callbacks, orders or bookings.

The phone adapter still needs carrier/SIP or a voice bridge, approved number/tenant routing, signed-event validation and replay protection, live audio handling, barge-in, tool permissions, staff presence, queues/extensions, transfer/hold/callback operations, recording/retention choices, usage billing, operational monitoring and real inbound-call exercises. OpenAI documents both direct SIP and a server audio bridge as supported voice architectures: [SIP and voice integration](https://developers.openai.com/api/docs/guides/voice-sip).

Do not place arbitrary destinations or customer text directly into transfer tools. Use approved staff/queue identifiers and bind every tool operation to the authenticated call, business and customer. Reuse the source ordering/booking APIs for validation and confirmation; online orders continue through their normal KDS route.

## Verification limits

Automated tests exercise the real SQL migrations and mocked provider boundary, including tenancy, permissions, input limits, quota races, customer ambiguity, revision conflicts, human follow-up preferences, stale callbacks and receipt ordering. TypeScript and the production build are checked. No microphone hardware, carrier account, live inbound call, live AI transcription, live transfer or source CRM synchronisation was exercised. Those are connection-specific rollout gates, not completed features.
