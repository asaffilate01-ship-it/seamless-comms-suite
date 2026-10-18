-- TreasuryOS Phase 6: metadata-only, service-role ingress receipts.
-- No raw bank content, account numbers, financial amounts, secrets, passwords,
-- payment instructions or executable schedules may be stored in these tables.
-- The separately approved server verifier MUST check actual payload SHA-256,
-- signature, tenant, provider and freshness before service-role insert.
BEGIN;

CREATE TABLE public.treasury_signed_source_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_kind text NOT NULL CHECK(source_kind IN (
    'bank_opening','bank_transactions','cash_general_ledger','cash_forecast','liquidity_policy'
  )),
  provider_key text NOT NULL CHECK(provider_key ~ '^[a-z][a-z0-9.-]{1,79}$'),
  key_id text NOT NULL CHECK(length(key_id) BETWEEN 8 AND 120),
  event_id text NOT NULL CHECK(length(event_id) BETWEEN 8 AND 120),
  source_digest_sha256 text NOT NULL CHECK(source_digest_sha256 ~ '^[a-f0-9]{64}$'),
  source_bytes integer NOT NULL CHECK(source_bytes BETWEEN 1 AND 2000000),
  signature_verified boolean NOT NULL CHECK(signature_verified = true),
  verification_mode text NOT NULL DEFAULT 'sandbox_shadow'
    CHECK(verification_mode='sandbox_shadow'),
  received_at timestamptz NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  retention_until timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  UNIQUE(id,tenant_id),
  UNIQUE(tenant_id,provider_key,event_id)
);
CREATE INDEX treasury_signed_receipts_tenant_idx
  ON public.treasury_signed_source_receipts(tenant_id,verified_at DESC);

CREATE TABLE public.treasury_shadow_run_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  source_bundle_sha256 text NOT NULL CHECK(source_bundle_sha256 ~ '^[a-f0-9]{64}$'),
  source_count integer NOT NULL DEFAULT 5 CHECK(source_count=5),
  source_status text NOT NULL CHECK(source_status IN('blocked','review_required','checked')),
  risk_status text NOT NULL CHECK(risk_status IN(
    'blocked','unassessed','breach','review_required','within_policy_assumptions'
  )),
  execution_mode text NOT NULL DEFAULT 'sandbox_shadow' CHECK(execution_mode='sandbox_shadow'),
  execution_enabled boolean NOT NULL DEFAULT false CHECK(execution_enabled=false),
  review_state text NOT NULL DEFAULT 'awaiting_review'
    CHECK(review_state='awaiting_review'),
  created_at timestamptz NOT NULL DEFAULT now(),
  retention_until timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  UNIQUE(id,tenant_id),
  UNIQUE(tenant_id,source_bundle_sha256)
);
CREATE INDEX treasury_shadow_runs_tenant_idx
  ON public.treasury_shadow_run_receipts(tenant_id,created_at DESC);

CREATE TABLE public.treasury_shadow_run_sources (
  run_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  receipt_id uuid NOT NULL,
  source_kind text NOT NULL CHECK(source_kind IN(
    'bank_opening','bank_transactions','cash_general_ledger','cash_forecast','liquidity_policy'
  )),
  FOREIGN KEY(run_id,tenant_id) REFERENCES public.treasury_shadow_run_receipts(id,tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY(receipt_id,tenant_id) REFERENCES public.treasury_signed_source_receipts(id,tenant_id) ON DELETE RESTRICT,
  PRIMARY KEY(run_id,source_kind),
  UNIQUE(run_id,receipt_id)
);
CREATE INDEX treasury_shadow_sources_tenant_idx
  ON public.treasury_shadow_run_sources(tenant_id,run_id);

-- Authenticated clients can read tenant metadata only. No signed source data,
-- signing keys or raw report numbers are ever stored or returned.
DO $ddl$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY[
    'treasury_signed_source_receipts',
    'treasury_shadow_run_receipts',
    'treasury_shadow_run_sources'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated',tab);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',tab);
  END LOOP;
END $ddl$;

CREATE POLICY "treasury source receipts tenant read"
  ON public.treasury_signed_source_receipts
  FOR SELECT TO authenticated USING (
    (public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))
    AND EXISTS(SELECT 1 FROM public.tenant_products tp
      WHERE tp.tenant_id=treasury_signed_source_receipts.tenant_id
      AND tp.product_key='finvessa' AND tp.status='active')
  );
CREATE POLICY "treasury runs tenant read"
  ON public.treasury_shadow_run_receipts
  FOR SELECT TO authenticated USING (
    (public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))
    AND EXISTS(SELECT 1 FROM public.tenant_products tp
      WHERE tp.tenant_id=treasury_shadow_run_receipts.tenant_id
      AND tp.product_key='finvessa' AND tp.status='active')
  );
CREATE POLICY "treasury run source links tenant read"
  ON public.treasury_shadow_run_sources
  FOR SELECT TO authenticated USING (
    (public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))
    AND EXISTS(SELECT 1 FROM public.tenant_products tp
      WHERE tp.tenant_id=treasury_shadow_run_sources.tenant_id
      AND tp.product_key='finvessa' AND tp.status='active')
  );

-- Service-role-only metadata audit writes. The trusted source processor and
-- signer verification step are NOT deployed by creating this migration.
-- Postgres constraints prevent cross-tenant run/receipt linkage and replayed
-- provider event identifiers. They do NOT validate remote bank signatures.
COMMIT;
