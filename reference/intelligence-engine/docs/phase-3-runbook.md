# Phase 3 operating runbook

## Safe activation order

1. Register the application and its permitted event names.
2. Exchange a unique webhook secret and send a signed test event.
3. Keep every new workflow in simulation until its sample set is reviewed.
4. Connect model credentials later through server-side runtime settings.
5. Set per-product budgets, confidence thresholds and provider fallbacks.
6. Require human approval for financial, compliance, safety, payment and external-message actions.
7. Promote one workflow at a time and monitor acceptance, latency, cost and failure rate.

## Provider policy

The gateway is provider-neutral. Extraction, classification, forecasting, reasoning and review are separate task classes. A workflow selects a task class rather than naming a vendor. This allows OpenAI and Gemini models to be added, changed or disabled without updating every SaaS.

## Failure handling

- Provider unavailable: route to the configured fallback or hold the run.
- Confidence below threshold: create an approval instead of acting.
- Budget exceeded: stop new model calls and continue deterministic validations.
- Duplicate event: acknowledge without creating another action.
- Downstream timeout: record the attempt and retry only idempotent deliveries.
