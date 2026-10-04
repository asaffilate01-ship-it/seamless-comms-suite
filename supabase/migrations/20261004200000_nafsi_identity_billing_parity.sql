-- Nafsi Phases 31-32: shadow-only identity/entitlement and billing parity.
-- The Factory stores fingerprints and outcomes, never Nafsi user IDs, PII,
-- payment identifiers, amounts or source subscription snapshots.
BEGIN;

CREATE TABLE IF NOT EXISTS public.nafsi_parity_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_connection_id uuid NOT NULL REFERENCES public.product_connections(id) ON DELETE CASCADE,
  external_tenant_id text NOT NULL,
  batch_id uuid NOT NULL,
  subject_hash text NOT NULL CHECK (subject_hash ~ '^[0-9a-f]{64}$'),
  scope text NOT NULL CHECK (scope IN ('identity','entitlement','billing')),
  input_fingerprint text NOT NULL CHECK (input_fingerprint ~ '^[0-9a-f]{64}$'),
  output_fingerprint text CHECK (output_fingerprint IS NULL OR output_fingerprint ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('matched','mismatch','error')),
  reason_codes text[] NOT NULL DEFAULT '{}',
  release_sha text NOT NULL CHECK (release_sha ~ '^[0-9a-f]{40}$'),
  mode text NOT NULL DEFAULT 'shadow' CHECK (mode='shadow'),
  authority_source text NOT NULL DEFAULT 'nafsi' CHECK (authority_source='nafsi'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,batch_id,subject_hash,scope)
);

CREATE INDEX IF NOT EXISTS nafsi_parity_receipts_batch_idx
  ON public.nafsi_parity_receipts(tenant_id,batch_id,status,scope);
CREATE INDEX IF NOT EXISTS nafsi_parity_receipts_release_idx
  ON public.nafsi_parity_receipts(tenant_id,release_sha,created_at DESC);

ALTER TABLE public.nafsi_parity_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nafsi_parity_receipts FROM anon,authenticated;
GRANT SELECT ON public.nafsi_parity_receipts TO authenticated;
GRANT ALL ON public.nafsi_parity_receipts TO service_role;
CREATE POLICY "Platform admins read Nafsi parity receipts"
ON public.nafsi_parity_receipts FOR SELECT TO authenticated
USING (public.is_platform_admin(auth.uid()));

INSERT INTO public.product_services(product_key,service_key,default_enabled,required,metadata)
VALUES (
  'nafsi','omniqora.identity',false,false,
  jsonb_build_object(
    'mode','shadow_parity_only','authority','nafsi','route','/api/control-plane/nafsi/parity',
    'storesPii',false,'createsAccounts',false,'automaticMigration',false,
    'subjectReference','keyed_opaque_reference'
  )
)
ON CONFLICT(product_key,service_key) DO UPDATE SET
  default_enabled=false,required=false,metadata=public.product_services.metadata || EXCLUDED.metadata;

UPDATE public.product_services SET metadata=metadata || jsonb_build_object(
  'mode','shadow_reconciliation_only','authority','nafsi',
  'route','/api/control-plane/nafsi/parity','storesPaymentIdentifiers',false,
  'storesAmounts',false,'movesMoney',false,'automaticMigration',false,
  'supportedProviders',jsonb_build_array('stripe','revenuecat','legacy')
) WHERE product_key='nafsi' AND service_key='omniqora.payments';

INSERT INTO public.blueprint_services(blueprint_key,service_key,required,config)
VALUES (
  'nafsi-gb-consumer','omniqora.identity',false,
  jsonb_build_object(
    'defaultEnabled',false,'mode','shadow_parity_only','authority','nafsi',
    'requiresExactReleaseEvidence',true,'automaticMigration',false
  )
)
ON CONFLICT(blueprint_key,service_key) DO UPDATE SET
  required=false,config=public.blueprint_services.config || EXCLUDED.config;

UPDATE public.blueprint_services SET config=config || jsonb_build_object(
  'defaultEnabled',false,'mode','shadow_reconciliation_only','authority','nafsi',
  'requiresExactReleaseEvidence',true,'automaticMigration',false
) WHERE blueprint_key='nafsi-gb-consumer' AND service_key='omniqora.payments';

UPDATE public.product_catalogue SET metadata=metadata || jsonb_build_object(
  'parityProtocol',jsonb_build_object(
    'route','/api/control-plane/nafsi/parity','mode','shadow','authority','nafsi',
    'scopes',jsonb_build_array('identity','entitlement','billing'),
    'storesPii',false,'storesPaymentIdentifiers',false,'automaticMigration',false
  )
) WHERE product_key='nafsi';

COMMENT ON TABLE public.nafsi_parity_receipts IS 'Privacy-minimal shadow receipts. subject_hash cannot identify a Nafsi user without the source-held pepper and mapping.';

COMMIT;
