-- Finvessa TreasuryOS Phase 5: trusted read-only source onboarding + inactive schedule drafts.
-- NO banking API endpoints, credentials, raw CSV, financial amounts or executable
-- schedules are stored here. This migration DOES NOT deploy a background worker.
BEGIN;

CREATE TABLE public.treasury_source_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL DEFAULT 'finvessa' CHECK(product_key='finvessa'),
  source_kind text NOT NULL CHECK(source_kind IN(
    'bank_opening','bank_transactions','cash_general_ledger','cash_forecast','liquidity_policy')),
  provider_family text NOT NULL CHECK(provider_family IN(
    'bank_api','erp_api','managed_sftp','managed_file')),
  provider_key text NOT NULL CHECK(provider_key ~ '^[a-z][a-z0-9.-]{1,79}$'),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  rationale text NOT NULL CHECK(length(rationale) BETWEEN 12 AND 500),
  status text NOT NULL DEFAULT 'requested' CHECK(status IN('requested','withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,source_kind,provider_key)
);
CREATE INDEX treasury_source_requests_tenant_status
  ON public.treasury_source_requests(tenant_id,status,created_at DESC);

-- This table is written ONLY by an independently approved service-role
-- qualification/revocation process, which is NOT deployed in this phase.
-- No actual API URL, vault secret path, token, user bank details or credentials.
CREATE TABLE public.treasury_verified_sources (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL DEFAULT 'finvessa' CHECK(product_key='finvessa'),
  source_kind text NOT NULL CHECK(source_kind IN(
    'bank_opening','bank_transactions','cash_general_ledger','cash_forecast','liquidity_policy')),
  provider_family text NOT NULL CHECK(provider_family IN(
    'bank_api','erp_api','managed_sftp','managed_file')),
  provider_key text NOT NULL CHECK(provider_key ~ '^[a-z][a-z0-9.-]{1,79}$'),
  status text NOT NULL DEFAULT 'unverified'
    CHECK(status IN('unverified','sandbox_verified','production_verified','suspended')),
  read_only boolean NOT NULL DEFAULT true CHECK(read_only),
  verified_scopes text[] NOT NULL DEFAULT '{}'::text[]
    CHECK(cardinality(verified_scopes) <= 16),
  proof_reference text,
  verified_at timestamptz,
  valid_until timestamptz,
  last_successful_read_at timestamptz,
  PRIMARY KEY(tenant_id,source_kind),
  CONSTRAINT treasury_verified_proof_required CHECK(
    status IN('unverified','suspended') OR (
      length(coalesce(proof_reference,'')) BETWEEN 8 AND 180
      AND verified_at IS NOT NULL AND valid_until IS NOT NULL
      AND last_successful_read_at IS NOT NULL AND valid_until > verified_at
    )
  )
);

-- These are schedule proposals ONLY. An explicit non-active mode constraint
-- makes schedule activation impossible using this schema.
CREATE TABLE public.treasury_schedule_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL DEFAULT 'finvessa' CHECK(product_key='finvessa'),
  frequency text NOT NULL DEFAULT 'business_days' CHECK(frequency IN('daily','business_days')),
  timezone text NOT NULL DEFAULT 'Europe/London'
    CHECK(timezone IN('UTC','Europe/London','Europe/Berlin',
      'America/New_York','America/Chicago','Asia/Karachi')),
  proposed_at time without time zone NOT NULL DEFAULT time '08:00',
  delivery_mode text NOT NULL DEFAULT 'dashboard_only' CHECK(delivery_mode='dashboard_only'),
  run_mode text NOT NULL DEFAULT 'simulation_only' CHECK(run_mode='simulation_only'),
  activation_status text NOT NULL DEFAULT 'draft' CHECK(activation_status IN('draft','paused')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  last_edited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX treasury_schedule_tenant_mode_idx
  ON public.treasury_schedule_drafts(tenant_id,activation_status);

DO $ddl$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY[
    'treasury_source_requests','treasury_verified_sources','treasury_schedule_drafts'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated',tab);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',tab);
  END LOOP;
END $ddl$;

CREATE POLICY "treasury source requests tenant read" ON public.treasury_source_requests
  FOR SELECT TO authenticated USING(
    (public.is_tenant_member(tenant_id,auth.uid()) OR public.is_platform_admin(auth.uid()))
    AND EXISTS(SELECT 1 FROM public.tenant_products tp
      WHERE tp.tenant_id=treasury_source_requests.tenant_id
        AND tp.product_key='finvessa' AND tp.status='active')
  );
CREATE POLICY "treasury verified sources tenant read" ON public.treasury_verified_sources
  FOR SELECT TO authenticated USING(
    (public.is_tenant_member(tenant_id,auth.uid()) OR public.is_platform_admin(auth.uid()))
    AND EXISTS(SELECT 1 FROM public.tenant_products tp
      WHERE tp.tenant_id=treasury_verified_sources.tenant_id
        AND tp.product_key='finvessa' AND tp.status='active')
  );
CREATE POLICY "treasury schedule draft tenant read" ON public.treasury_schedule_drafts
  FOR SELECT TO authenticated USING(
    (public.is_tenant_member(tenant_id,auth.uid()) OR public.is_platform_admin(auth.uid()))
    AND EXISTS(SELECT 1 FROM public.tenant_products tp
      WHERE tp.tenant_id=treasury_schedule_drafts.tenant_id
        AND tp.product_key='finvessa' AND tp.status='active')
  );

-- Idempotent, request-only user action. It NEVER inserts a verified connector.
CREATE OR REPLACE FUNCTION public.request_treasury_readonly_source(
  _tenant uuid,_kind text,_family text,_provider text,_rationale text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE member_role text; created uuid; existing_status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT role INTO member_role FROM public.tenant_members
    WHERE tenant_id=_tenant AND user_id=auth.uid();
  IF COALESCE(member_role,'') NOT IN('owner','admin')
    AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Tenant treasury administrator required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tenant_products tp
    WHERE tp.tenant_id=_tenant AND tp.product_key='finvessa' AND tp.status='active') THEN
    RAISE EXCEPTION 'Active Finvessa tenant entitlement required'; END IF;
  IF _kind IS NULL OR _kind NOT IN(
      'bank_opening','bank_transactions','cash_general_ledger','cash_forecast','liquidity_policy')
    OR _family IS NULL OR _family NOT IN('bank_api','erp_api','managed_sftp','managed_file')
    OR _provider IS NULL OR _provider !~ '^[a-z][a-z0-9.-]{1,79}$'
    OR _rationale IS NULL OR length(trim(_rationale)) NOT BETWEEN 12 AND 500 THEN
    RAISE EXCEPTION 'Invalid read-only source request'; END IF;
  INSERT INTO public.treasury_source_requests
    (tenant_id,source_kind,provider_family,provider_key,requested_by,rationale)
  VALUES(_tenant,_kind,_family,_provider,auth.uid(),trim(_rationale))
  ON CONFLICT(tenant_id,source_kind,provider_key) DO NOTHING
  RETURNING id INTO created;
  IF created IS NULL THEN
    SELECT id,status INTO STRICT created,existing_status
      FROM public.treasury_source_requests
      WHERE tenant_id=_tenant AND source_kind=_kind AND provider_key=_provider;
  ELSE existing_status:='requested'; END IF;
  RETURN jsonb_build_object(
    'requestId',created,'status',existing_status,'alreadyExists',existing_status<>'requested'
  );
END $$;

-- Drafts are never enqueued, activated or sent to external communication channels.
CREATE OR REPLACE FUNCTION public.save_treasury_schedule_draft(
  _tenant uuid,_frequency text,_timezone text,_run_time text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE member_role text; draft_id uuid; safe_time time; trimmed text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT role INTO member_role FROM public.tenant_members
    WHERE tenant_id=_tenant AND user_id=auth.uid();
  IF COALESCE(member_role,'') NOT IN('owner','admin')
    AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Tenant treasury administrator required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tenant_products tp
    WHERE tp.tenant_id=_tenant AND tp.product_key='finvessa' AND tp.status='active') THEN
    RAISE EXCEPTION 'Active Finvessa tenant entitlement required'; END IF;
  IF _frequency IS NULL OR _frequency NOT IN('daily','business_days')
    OR _timezone IS NULL OR _timezone NOT IN(
      'UTC','Europe/London','Europe/Berlin','America/New_York','America/Chicago','Asia/Karachi')
    OR _run_time IS NULL OR _run_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    RAISE EXCEPTION 'Invalid schedule draft'; END IF;
  safe_time:=_run_time::time;
  INSERT INTO public.treasury_schedule_drafts(
    tenant_id,frequency,timezone,proposed_at,created_by,last_edited_by)
  VALUES(_tenant,_frequency,_timezone,safe_time,auth.uid(),auth.uid())
  ON CONFLICT(tenant_id) DO UPDATE SET
    frequency=EXCLUDED.frequency,timezone=EXCLUDED.timezone,
    proposed_at=EXCLUDED.proposed_at,activation_status='draft',
    last_edited_by=auth.uid(),updated_at=now()
  RETURNING id INTO draft_id;
  RETURN jsonb_build_object('draftId',draft_id,'status','draft','executionEnabled',false);
END $$;

REVOKE ALL ON FUNCTION public.request_treasury_readonly_source(
  uuid,text,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.save_treasury_schedule_draft(
  uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_treasury_readonly_source(
  uuid,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_treasury_schedule_draft(
  uuid,text,text,text) TO authenticated;

COMMIT;
