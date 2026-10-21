-- Ruflo Phase 8: make the independently reviewed MCP input-schema digest
-- mandatory for tenant sandbox attestation. No credentials, tools or tenants
-- are created, and existing requests do not become authorised.
BEGIN;

ALTER TABLE public.ai_ruflo_tenant_bindings
 ADD COLUMN IF NOT EXISTS probe_manifest_sha256 text;
ALTER TABLE public.ai_ruflo_tenant_bindings
 ADD CONSTRAINT ai_ruflo_manifest_pin_check
 CHECK(probe_manifest_sha256 IS NULL OR probe_manifest_sha256 ~ '^[a-f0-9]{64}$') NOT VALID;
ALTER TABLE public.ai_ruflo_tenant_bindings
 ADD CONSTRAINT ai_ruflo_verified_requires_manifest_check
 CHECK(status<>'sandbox_verified' OR probe_manifest_sha256 IS NOT NULL) NOT VALID;

-- Fail closed for any previously attested sandbox missing a manifest pin.
-- This is a separate new version of the Phase 5 gate and never installs MCP.
CREATE OR REPLACE FUNCTION public.ruflo_probe_gate(
 _tenant uuid,_product text,_probe text,_region text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT _probe IN('swarm_health','swarm_status','agent_list') AND EXISTS(
  SELECT 1 FROM public.ai_ruflo_pilot_requests p
  JOIN public.ai_ruflo_tenant_bindings b
   ON b.tenant_id=p.tenant_id AND b.product_key=p.product_key
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
   AND public.has_tenant_entitlement(_tenant,'omniqora.intelligence-runtime')
 );
$$;

-- The privileged preflight carries *only* the reviewed digest, tool key,
-- current lease and region. The worker compares it to its own independent
-- manifest pin and to the actual tool schemas at process startup.
CREATE OR REPLACE FUNCTION public.preflight_ruflo_probe(
 _tenant uuid,_product text,_task uuid,_claim uuid,_worker text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.ai_ruflo_probe_tasks; binding public.ai_ruflo_tenant_bindings;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'Trusted Ruflo worker required'; END IF;
 SELECT * INTO item FROM public.ai_ruflo_probe_tasks
 WHERE id=_task AND tenant_id=_tenant AND product_key=_product;
 IF item.id IS NULL OR item.status<>'processing' OR item.claim_token IS DISTINCT FROM _claim
  OR item.claimed_by IS DISTINCT FROM _worker OR item.lease_expires_at<=now()
 THEN RETURN jsonb_build_object('allowed',false); END IF;
 IF NOT public.ruflo_probe_gate(_tenant,_product,item.probe_key,item.data_region)
 THEN RETURN jsonb_build_object('allowed',false); END IF;
 SELECT * INTO STRICT binding FROM public.ai_ruflo_tenant_bindings
 WHERE tenant_id=_tenant AND product_key=_product;
 RETURN jsonb_build_object('allowed',true,'toolName',item.probe_key,
  'expectedDigest',binding.executable_sha256,
  'expectedManifestDigest',binding.probe_manifest_sha256,
  'dataRegion',item.data_region,'leaseExpiresAt',item.lease_expires_at);
END $$;
REVOKE ALL ON FUNCTION public.ruflo_probe_gate(uuid,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ruflo_probe_gate(uuid,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.preflight_ruflo_probe(uuid,text,uuid,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preflight_ruflo_probe(uuid,text,uuid,uuid,text) TO service_role;
COMMIT;
