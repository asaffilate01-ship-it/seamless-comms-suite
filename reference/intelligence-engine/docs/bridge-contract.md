# AI Core Bridge Contract v1

Every SaaS sends business events to `POST /api/v1/events/{application}`. Keep customer source data in the originating SaaS and send only the fields required by the selected workflow.

## Required headers

- `Content-Type: application/json`
- `Idempotency-Key`: stable across retries
- `X-AI-Core-Timestamp`: Unix seconds
- `X-AI-Core-Signature`: `sha256=` plus the lower-case HMAC SHA-256 digest of `{timestamp}.{rawBody}`

## Event envelope

```json
{"event_id":"evt_01J...","event_type":"dishbee.shift.closed","occurred_at":"2026-09-08T10:30:00Z","data":{"site_id":"cafe1-luton","gross_sales_pence":184200,"waste_value_pence":7350}}
```

## Delivery rules

- Reject signatures older than five minutes.
- Retry `429` and `5xx` responses with exponential backoff and jitter.
- Treat `200`, `202` and duplicate acknowledgements as delivered.
- Never retry validation or authentication failures without correcting the request.
- Rotate each application's secret independently.

| Product | Event | Purpose |
| --- | --- | --- |
| Dishbee | `dishbee.shift.closed` | Margin, stock, labour and waste briefing |
| Haccora | `haccora.check.failed` | Corrective-action assessment |
| Cirqiva | `cirqiva.collection.completed` | Diversion and collection optimisation |
| Premisora | `premisora.change.created` | Cost and programme impact review |
| DOMUREVA | `domureva.claim.updated` | Grant evidence completeness |
| Dokuvera | `dokuvera.revision.created` | Document change classification |
| Zoryn Pay | `zoryn.payment.risk_flagged` | Payment exception triage |
