-- Add source-scoped uniqueness to CRM opportunity and activity receipt ingestion.
-- Null source keys remain permitted for manually created CRM records.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS crm_opportunities_source_external_uq
 ON public.crm_opportunities(tenant_id,source_product_key,external_ref)
 WHERE source_product_key IS NOT NULL AND external_ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crm_activities_source_external_uq
 ON public.crm_activities(tenant_id,source_product_key,external_ref)
 WHERE source_product_key IS NOT NULL AND external_ref IS NOT NULL;
COMMIT;
