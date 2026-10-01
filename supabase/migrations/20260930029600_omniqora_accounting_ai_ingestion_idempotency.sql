-- Idempotent machine-ingestion support for accounting extraction proposals.
BEGIN;

ALTER TABLE public.accounting_staging_entries
  ADD COLUMN IF NOT EXISTS source_ref text;

UPDATE public.accounting_staging_entries
SET source_ref='legacy:'||id::text
WHERE source_ref IS NULL;

ALTER TABLE public.accounting_staging_entries
  ALTER COLUMN source_ref SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS accounting_staging_source_uq
 ON public.accounting_staging_entries(tenant_id,batch_id,source_ref);

COMMIT;
