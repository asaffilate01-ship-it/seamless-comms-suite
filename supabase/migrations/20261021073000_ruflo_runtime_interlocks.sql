-- Ruflo Phase 10: staging-only runtime interlocks and immediate emergency stop.
-- This migration creates NO approved controls, connections, credentials or jobs.
-- Ruflo customer/business-agent execution remains forbidden.
BEGIN;

CREATE TABLE public.ai_ruflo_staging_controls (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'disabled'
  CHECK(status IN('disabled','staging_approved','suspended')),
 approved_by uuid REFERENCES auth.users(id),
 approved_at timestamptz,
 expires_at timestamptz,
 evidence_reference text CHECK(evidence_reference IS NULL OR length(evidence_reference) BETWEEN 12 AND 500),
 stopped_by uuid REFERENCES auth.users(id),
 stopped_at timestamptz,
 stop_reason text CHECK(stop_reason IS NULL OR length(trim(stop_reason)) BETWEEN 16 AND 500),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,product_key),
 CHECK(status <> 'staging_approved' OR (
  approved_by IS NOT NULL AND approved_at IS NOT NULL
  AND expires_at IS NOT NULL AND evidence_reference IS NOT NULL
 ))
);

ALTER TABLE public.ai_ruflo_staging_controls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_ruflo_staging_controls FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ai_ruflo_staging_controls TO authenticated;
GRANT ALL ON public.ai_ruflo_staging_controls TO service_role;
CREATE POLICY "ruflo interlock scoped read" ON public.ai_ruflo_staging_controls
 FOR SELECT TO authenticated USING (
  public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid())
 );

-- Approval is a release-process action by a trusted service role, never a
-- browser/RPC button. A reviewer and independently attested sandbox are
-- mandatory, and approval cannot outlive a 24-hour staging window.
CREATE OR REPLACE FUNCTION public.guard_ruflo_staging_control()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.status='staging_approved' THEN
  IF NEW.approved_at > now() OR NEW.approved_at < now()-interval '15 minutes'
    OR NEW.expires_at <= now() OR NEW.expires_at > now()+interval '24 hours'
    OR NEW.approved_by IS NULL OR NOT public.is_platform_admin(NEW.approved_by)
    OR NEW.evidence_reference IS NULL
  THEN RAISE EXCEPTION 'Fresh independently reviewed staging evidence required'; END IF;
  IF NOT EXISTS (
   SELECT 1 FROM public.ai_ruflo_pilot_requests p
   JOIN public.ai_ruflo_tenant_bindings b
    ON b.tenant_id=p.tenant_id AND b.product_key=p.product_key
   JOIN public.tenants t ON t.id=p.tenant_id
   JOIN public.tenant_products tp
    ON tp.tenant_id=p.tenant_id AND tp.product_key=p.product_key
   WHERE p.tenant_id=NEW.tenant_id AND p.product_key=NEW.product_key
    AND p.status='shortlisted' AND p.reviewed_by IS NOT NULL
    AND p.requested_by <> p.reviewed_by
    AND p.requested_by <> NEW.approved_by
    AND b.status='sandbox_verified'
    AND b.executable_sha256 ~ '^[a-f0-9]{64}$'
    AND b.probe_manifest_sha256 ~ '^[a-f0-9]{64}$'
    AND b.verified_at<=now() AND b.verified_at>=now()-interval '30 days'
    AND t.country_code=b.data_region AND t.country_code=p.data_region
    AND tp.status='active'
  ) OR NOT public.has_tenant_entitlement(NEW.tenant_id,'omniqora.intelligence-runtime')
  THEN RAISE EXCEPTION 'Ruflo staging tenant approval is not independently verified'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ruflo_stage_approval_guard
 BEFORE INSERT OR UPDATE ON public.ai_ruflo_staging_controls
 FOR EACH ROW EXECUTE FUNCTION public.guard_ruflo_staging_control();

-- Every request, claim, preflight and result settlement already calls
-- ruflo_probe_gate. Replacing this gate adds the independently approved,
-- unexpired staging interlock; absent table rows deny execution by default.
CREATE OR REPLACE FUNCTION public.ruflo_probe_gate(
 _tenant uuid,_product text,_probe text,_region text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT _probe IN('swarm_health','swarm_status','agent_list') AND EXISTS (
  SELECT 1 FROM public.ai_ruflo_pilot_requests p
  JOIN public.ai_ruflo_tenant_bindings b
    ON b.tenant_id=p.tenant_id AND b.product_key=p.product_key
  JOIN public.ai_ruflo_staging_controls gate
    ON gate.tenant_id=p.tenant_id AND gate.product_key=p.product_key
  JOIN public.tenants t ON t.id=p.tenant_id
  JOIN public.tenant_products tp
    ON tp.tenant_id=p.tenant_id AND tp.product_key=p.product_key
  WHERE p.tenant_id=_tenant AND p.product_key=_product
    AND p.status='shortlisted' AND p.reviewed_by IS NOT NULL
    AND p.requested_by<>p.reviewed_by
    AND b.status='sandbox_verified' AND _probe=ANY(b.allowed_probe_tools)
    AND b.verified_by IS NOT NULL AND b.verified_by<>p.requested_by
    AND public.is_platform_admin(b.verified_by)
    AND b.executable_sha256 ~ '^[a-f0-9]{64}$'
    AND b.probe_manifest_sha256 ~ '^[a-f0-9]{64}$'
    AND b.verified_at<=now() AND b.verified_at>=now()-interval '30 days'
    AND b.data_region=_region AND p.data_region=_region AND t.country_code=_region
    AND tp.status='active'
    AND gate.status='staging_approved'
    AND gate.approved_by IS NOT NULL AND gate.approved_by<>p.requested_by
    AND public.is_platform_admin(gate.approved_by)
    AND gate.approved_at<=now() AND gate.expires_at>now()
    AND public.has_tenant_entitlement(_tenant,'omniqora.intelligence-runtime')
 );
$$;
REVOKE ALL ON FUNCTION public.ruflo_probe_gate(uuid,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ruflo_probe_gate(uuid,text,text,text) TO service_role;

-- Any tenant owner/admin or platform administrator can STOP a pilot immediately.
-- Stopping can never enable Ruflo again. It also denies still-queued probes,
-- while in-flight probes fail their preflight/final-authority recheck.
CREATE OR REPLACE FUNCTION public.stop_ruflo_sandbox(
 _tenant uuid,_product text,_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE affected integer:=0;
BEGIN
 IF auth.uid() IS NULL OR
    _reason IS NULL OR length(trim(_reason)) NOT BETWEEN 16 AND 500
 THEN RAISE EXCEPTION 'Authenticated stop reason required'; END IF;
 IF NOT (
  public.is_platform_admin(auth.uid()) OR EXISTS (
   SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=_tenant
   AND m.user_id=auth.uid() AND m.role IN('owner','admin')
  )
 ) THEN RAISE EXCEPTION 'Ruflo suspension requires tenant administrator'; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.tenant_products p WHERE p.tenant_id=_tenant AND p.product_key=_product
 ) THEN RAISE EXCEPTION 'Tenant product not found'; END IF;

 INSERT INTO public.ai_ruflo_staging_controls (
  tenant_id,product_key,status,stopped_by,stopped_at,stop_reason
 ) VALUES (
  _tenant,_product,'suspended',auth.uid(),now(),trim(_reason)
 )
 ON CONFLICT(tenant_id,product_key) DO UPDATE
 SET status='suspended',stopped_by=auth.uid(),stopped_at=now(),
  stop_reason=EXCLUDED.stop_reason,updated_at=now();

 UPDATE public.ai_ruflo_tenant_bindings SET status='suspended',updated_at=now()
 WHERE tenant_id=_tenant AND product_key=_product AND status='sandbox_verified';

 UPDATE public.ai_ruflo_probe_tasks SET status='denied',error_code='policy_denied',
   completed_at=now()
 WHERE tenant_id=_tenant AND product_key=_product AND status='queued';
 GET DIAGNOSTICS affected=ROW_COUNT;
 RETURN jsonb_build_object('status','suspended','queuedProbesDenied',affected,
  'customerAgentExecutionEnabled',false);
END $$;

REVOKE ALL ON FUNCTION public.stop_ruflo_sandbox(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.stop_ruflo_sandbox(uuid,text,text) TO authenticated;

COMMIT;
