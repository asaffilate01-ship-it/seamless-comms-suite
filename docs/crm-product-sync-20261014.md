# Omniqora CRM source sync — 14 October 2026

This is a **development source contract**, not a live product rollout. Existing /app/crm, contacts, WhatsApp, RFM and Sales keep their own permissions and authorities.

## API
Connected SaaS applications use the existing authenticated service-to-service endpoint POST /api/platform/crm with credentials bound to their exact Omniqora tenant and product, with capability crm.write. Examples of new operations:
- lead.upsert: externalRef, title, status, optional personExternalRef and companyExternalRef, source, score, metadata.
- opportunity.upsert: externalRef, title, pipelineKey, stageKey, optional source person/company references, amount, currency, expectedCloseAt, status.
- activity.record: pass one stable, unique source event ID as externalRef. Replays never add duplicate activity rows.
These supplement person.upsert and company.upsert.

Related records must already exist under the exact same tenant and product. No automatic cross-product identity merger on email or phone. Never infer permission to send marketing from a lead event. Consent follows source-of-truth rules. The upstream product owns order, booking, finance and compliance records.

## Integration gates
Apply migrations in order and re-run complete Postgres RLS/migration tests; configure approved product service credentials in their own secret managers; enable omniqora.crm entitlement; reconcile initial and incremental source events with idempotency keys, timestamp ordering and conflict rules. Do not fabricate leads or activate another product without approval.

Source APIs map customer relations; they do not yet provide a bidirectional master-data sync, product connector onboarding or hosted worker. Pilot first with Dishbee and one non-food product.
