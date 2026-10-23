-- Ruflo is an OPTIONAL, isolated MCP engineering pilot. No agents, credentials,
-- tenants, bindings, model providers or customer data are enabled by this DDL.
BEGIN;

CREATE TABLE public.ai_ruflo_pilot_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
 data_region text NOT NULL CHECK(data_region ~ '^[A-Z]{2}$'),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 16 AND 500),
 status text NOT NULL DEFAULT 'requested' CHECK(status IN('requested','shortlisted','rejected','revoked')),
 requested_by uuid NOT NULL REFERENCES auth.users(id),
 reviewed_by uuid REFERENCES auth.users(id),
 review_note text,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key)
);
CREATE INDEX ai_ruflo_requests_review_idx ON public.ai_ruflo_pilot_requests(status,created_at DESC);

-- A shortlist is NOT an active binding. Only a trusted release process using
-- the service role may record independently verified read-only sandbox evidence.
CREATE TABLE public.ai_ruflo_tenant_bindings (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'disabled'
   CHECK(status IN('disabled','sandbox_verified','suspended')),
 upstream_version text,
 executable_sha256 text CHECK(executable_sha256 IS NULL OR executable_sha256 ~ '^[a-f0-9]{64}$'),
 data_region text CHECK(data_region IS NULL OR data_region ~ '^[A-Z]{2}$'),
 allowed_probe_tools text[] NOT NULL DEFAULT '{}'::text[]
   CHECK(allowed_probe_tools <@ ARRAY['swarm_health','swarm_status','agent_list']::text[]),
 verified_at timestamptz,
 verified_by uuid REFERENCES auth.users(id),
 evidence_reference text CHECK(evidence_reference IS NULL OR length(evidence_reference)<=500),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,product_key),
 CHECK(status<>'sandbox_verified' OR (
  upstream_version IS NOT NULL AND executable_sha256 IS NOT NULL
  AND data_region IS NOT NULL AND verified_at IS NOT NULL
  AND verified_by IS NOT NULL AND evidence_reference IS NOT NULL
  AND cardinality(allowed_probe_tools)>0
 ))
);

-- An attestation alone cannot enable a tenant: require an independently
-- shortlisted request, current active product/entitlement, same country and
-- independently verified upstream digest before a sandbox can be marked ready.
CREATE OR REPLACE FUNCTION public.guard_ruflo_tenant_binding()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.status='sandbox_verified' THEN
  IF NOT EXISTS(
   SELECT 1 FROM public.ai_ruflo_pilot_requests p
   JOIN public.tenants t ON t.id=p.tenant_id
   JOIN public.tenant_products tp ON tp.tenant_id=p.tenant_id AND tp.product_key=p.product_key
   WHERE p.tenant_id=NEW.tenant_id AND p.product_key=NEW.product_key
    AND p.status='shortlisted' AND p.reviewed_at IS NOT NULL
    AND p.reviewed_by IS NOT NULL AND p.requested_by<>p.reviewed_by
    AND p.data_region=NEW.data_region AND t.country_code=NEW.data_region
    AND tp.status='active'
  ) THEN RAISE EXCEPTION 'Independent Ruflo pilot, region and active product review required'; END IF;
  IF NOT public.has_tenant_entitlement(NEW.tenant_id,'omniqora.intelligence-runtime')
  THEN RAISE EXCEPTION 'AI runtime entitlement required before Ruflo sandbox verification'; END IF;
  IF NOT public.is_platform_admin(NEW.verified_by) OR NEW.verified_at>now()
    OR NEW.verified_at<now()-interval '30 days'
  THEN RAISE EXCEPTION 'Current platform-verified Ruflo evidence required'; END IF;
  IF EXISTS(
   SELECT 1 FROM public.ai_ruflo_pilot_requests p
   WHERE p.tenant_id=NEW.tenant_id AND p.product_key=NEW.product_key
    AND p.requested_by=NEW.verified_by
  ) THEN RAISE EXCEPTION 'Ruflo pilot requester cannot attest sandbox'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ai_ruflo_binding_scope_guard BEFORE INSERT OR UPDATE
 ON public.ai_ruflo_tenant_bindings FOR EACH ROW
 EXECUTE FUNCTION public.guard_ruflo_tenant_binding();

-- Metadata receipts only. No prompts, tool outputs, secrets, or sensitive payloads.
CREATE TABLE public.ai_ruflo_probe_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
 run_id uuid REFERENCES public.ai_agent_runs(id) ON DELETE SET NULL,
 job_id uuid REFERENCES public.intelligence_jobs(id) ON DELETE SET NULL,
 probe_key text NOT NULL CHECK(probe_key IN('swarm_health','swarm_status','agent_list')),
 result_status text NOT NULL CHECK(result_status IN('passed','failed','timed_out','denied')),
 worker_receipt_ref text NOT NULL CHECK(length(worker_receipt_ref) BETWEEN 8 AND 160),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,worker_receipt_ref)
);
CREATE INDEX ai_ruflo_receipts_recent_idx ON public.ai_ruflo_probe_receipts(tenant_id,product_key,recorded_at DESC);

CREATE OR REPLACE FUNCTION public.guard_ruflo_probe_receipt_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.run_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.ai_agent_runs r
  WHERE r.id=NEW.run_id AND r.tenant_id=NEW.tenant_id AND r.product_key=NEW.product_key
 ) THEN RAISE EXCEPTION 'Ruflo run belongs to another tenant/product'; END IF;
 IF NEW.job_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.intelligence_jobs j
  WHERE j.id=NEW.job_id AND j.tenant_id=NEW.tenant_id AND j.product_key=NEW.product_key
 ) THEN RAISE EXCEPTION 'Ruflo job belongs to another tenant/product'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ai_ruflo_probe_scope_guard BEFORE INSERT OR UPDATE
 ON public.ai_ruflo_probe_receipts FOR EACH ROW
 EXECUTE FUNCTION public.guard_ruflo_probe_receipt_scope();

DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY[
  'ai_ruflo_pilot_requests','ai_ruflo_tenant_bindings','ai_ruflo_probe_receipts'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',tab);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',tab);
  EXECUTE format('CREATE POLICY "ruflo tenant scoped read" ON public.%I FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))',tab);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.request_ruflo_pilot(
 _tenant uuid,_product text,_region text,_reason text
) RETURNS public.ai_ruflo_pilot_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rec public.ai_ruflo_pilot_requests;
BEGIN
 IF auth.uid() IS NULL OR NOT (
  public.is_platform_admin(auth.uid()) OR EXISTS(
   SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=_tenant
    AND m.user_id=auth.uid() AND m.role IN('owner','admin')
  )
 ) THEN RAISE EXCEPTION 'Tenant administrator required'; END IF;
 IF _reason IS NULL OR length(trim(_reason)) NOT BETWEEN 16 AND 500 OR
  _region IS NULL OR _region !~ '^[A-Z]{2}$' OR
  _region IS DISTINCT FROM (SELECT t.country_code FROM public.tenants t WHERE t.id=_tenant)
 THEN RAISE EXCEPTION 'Valid tenant data region and justification required'; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.tenant_products p WHERE p.tenant_id=_tenant
    AND p.product_key=_product AND p.status='active'
 ) OR NOT public.has_tenant_entitlement(_tenant,'omniqora.intelligence-runtime')
 THEN RAISE EXCEPTION 'Active tenant product and AI entitlement required'; END IF;
 INSERT INTO public.ai_ruflo_pilot_requests(tenant_id,product_key,data_region,reason,requested_by)
 VALUES(_tenant,_product,_region,trim(_reason),auth.uid())
 ON CONFLICT(tenant_id,product_key) DO NOTHING
 RETURNING * INTO rec;
 IF rec.id IS NULL THEN
  SELECT * INTO STRICT rec FROM public.ai_ruflo_pilot_requests
   WHERE tenant_id=_tenant AND product_key=_product;
 END IF;
 RETURN rec;
END $$;

CREATE OR REPLACE FUNCTION public.review_ruflo_pilot(
 _request uuid,_decision text,_note text
) RETURNS public.ai_ruflo_pilot_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rec public.ai_ruflo_pilot_requests;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid())
 THEN RAISE EXCEPTION 'Platform approval required'; END IF;
 IF _decision NOT IN('shortlisted','rejected','revoked') OR
  _note IS NULL OR length(trim(_note)) NOT BETWEEN 16 AND 1500
 THEN RAISE EXCEPTION 'Decision and review evidence are required'; END IF;
 SELECT * INTO STRICT rec FROM public.ai_ruflo_pilot_requests WHERE id=_request FOR UPDATE;
 IF rec.requested_by=auth.uid() THEN RAISE EXCEPTION 'Independent reviewer required'; END IF;
 IF rec.status NOT IN('requested','shortlisted') THEN RAISE EXCEPTION 'Ruflo pilot request is closed'; END IF;
 UPDATE public.ai_ruflo_pilot_requests
 SET status=_decision,review_note=trim(_note),reviewed_by=auth.uid(),reviewed_at=now()
 WHERE id=_request RETURNING * INTO rec;
 IF _decision IN('revoked','rejected') THEN
  UPDATE public.ai_ruflo_tenant_bindings SET status='suspended',updated_at=now()
  WHERE tenant_id=rec.tenant_id AND product_key=rec.product_key AND status='sandbox_verified';
 END IF;
 -- Important: this does NOT provision ai_ruflo_tenant_bindings, install
 -- an MCP server, assign a credential or enable agent execution.
 RETURN rec;
END $$;

REVOKE ALL ON FUNCTION public.request_ruflo_pilot(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.review_ruflo_pilot(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_ruflo_pilot(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_ruflo_pilot(uuid,text,text) TO authenticated;
COMMIT;
