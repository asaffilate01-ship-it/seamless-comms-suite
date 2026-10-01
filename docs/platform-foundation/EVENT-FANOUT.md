# Event fan-out and module projections

Every source SaaS sends a canonical tenant-scoped event once. Omniqora fans it out only to entitled modules whose event patterns match.

Examples:

- `order.completed` can feed CRM, Analytics, Financials, Journeys and Feedback;
- `marketplace.order.accepted` can feed Dispatch;
- `crm.lead.created` can feed Sales and Analytics;
- `marketing.campaign.started` can feed Analytics and Journeys.

## Durable processing

`platform_module_event_queue` is service-role only and supports:

- idempotent event/module queue entries;
- SKIP LOCKED batch claiming;
- stale-lock recovery;
- bounded retries with exponential backoff;
- dead state after repeated failure.

Module processors must remain idempotent. Producing a new event from a consumed event should retain correlation/causation IDs and avoid unbounded event loops.

External webhook/queue subscriptions continue to use `platform_event_subscriptions` and `platform_event_deliveries`.

## Activation

No worker is automatically started by this source. Deployment must run `runModuleEventBatch()` in an approved worker/scheduler and register only reviewed processors.