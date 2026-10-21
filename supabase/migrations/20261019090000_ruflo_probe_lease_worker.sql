-- Ruflo Phase 5: opt-in health probes only. No customer prompts or autonomous
-- AI jobs are processed. No installed Ruflo/MCP server, accounts or grants seeded.
BEGIN;

CREATE TABLE public.ai_ruflo_probe_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
 probe_key text NOT NULL CHECK(probe_key IN('swarm_health','swarm_status','agent_list')),
 data_region text NOT NULL CHECK(data_region ~ '^[A-Z]{2}$'),
 idempotency_key uuid NOT NULL,
 requested_by uuid NOT NULL REFERENCES auth.users(id),
 status text NOT NULL DEFAULT 'queued'
  CHECK(status IN('queued','processing','passed','failed','timed_out','denied','cancelled')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 2),
 claim_token uuid,
 claimed_by text,
 lease_expires_at timestamptz,
 result_receipt_ref text,
 error_code text CHECK(error_code IS NULL OR error_code IN('policy_denied','protocol_error','timeout','probe_error','lease_expired')),
 created_at timestamptz NOT NULL DEFAULT now(),
 started_at timestamptz,
 completed_at timestamptz,
 UNIQUE(tenant_id,product_key,idempotency_key),
 CHECK(status<>'processing' OR (claim_token IS NOT NULL AND claimed_by IS NOT NULL AND lease_expires_at IS NOT NULL))
);
CREATE UNIQUE INDEX ai_ruflo_one_active_probe_idx
 ON public.ai_ruflo_probe_tasks(tenant_id,product_key) WHERE status IN('queued','processing');
CREATE INDEX ai_ruflo_probe_queue_idx
 ON public.ai_ruflo_probe_tasks(tenant_id,product_key,status,created_at);

ALTER TABLE public.ai_ruflo_probe_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_ruflo_probe_tasks FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ai_ruflo_probe_tasks TO authenticated;
GRANT ALL ON public.ai_ruflo_probe_tasks TO service_role;
CREATE POLICY "ruflo probe tenant read" ON public.ai_ruflo_probe_tasks
 FOR SELECT TO authenticated USING(
  public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid())
 );

-- All preflight checks use current authoritative state, not a UI payload.
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
   AND b.verified_at<=now() AND b.verified_at>=now()-interval '30 days'
   AND b.data_region=_region AND p.data_region=_region AND t.country_code=_region
   AND tp.status='active'
   AND public.has_tenant_entitlement(_tenant,'omniqora.intelligence-runtime')
 );
$$;
REVOKE ALL ON FUNCTION public.ruflo_probe_gate(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ruflo_probe_gate(uuid,text,text,text) TO service_role;

-- Only an authenticated tenant owner/admin may request a no-content health
-- probe. No arbitrary goals, prompts, tool arguments or source references.
CREATE OR REPLACE FUNCTION public.request_ruflo_probe(
 _tenant uuid,_product text,_probe text,_idempotency uuid
) RETURNS public.ai_ruflo_probe_tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.ai_ruflo_probe_tasks; region_code text;
BEGIN
 IF auth.uid() IS NULL OR _idempotency IS NULL OR NOT (
  public.is_platform_admin(auth.uid()) OR EXISTS(
   SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=_tenant
   AND m.user_id=auth.uid() AND m.role IN('owner','admin')
  )
 ) THEN RAISE EXCEPTION 'Ruflo probe tenant administrator required'; END IF;
 SELECT country_code INTO region_code FROM public.tenants WHERE id=_tenant;
 IF NOT public.ruflo_probe_gate(_tenant,_product,_probe,region_code)
 THEN RAISE EXCEPTION 'Independent Ruflo sandbox verification required'; END IF;
 SELECT * INTO item FROM public.ai_ruflo_probe_tasks
 WHERE tenant_id=_tenant AND product_key=_product AND idempotency_key=_idempotency;
 IF item.id IS NOT NULL THEN
  IF item.probe_key<>_probe THEN RAISE EXCEPTION 'Ruflo idempotency payload mismatch'; END IF;
  RETURN item;
 END IF;
 IF (SELECT count(*) FROM public.ai_ruflo_probe_tasks
  WHERE tenant_id=_tenant AND product_key=_product AND created_at>now()-interval '24 hours')>=5
 THEN RAISE EXCEPTION 'Ruflo sandbox probe daily limit reached'; END IF;
 INSERT INTO public.ai_ruflo_probe_tasks(tenant_id,product_key,probe_key,data_region,idempotency_key,requested_by)
 VALUES(_tenant,_product,_probe,region_code,_idempotency,auth.uid())
 RETURNING * INTO item;
 RETURN item;
END $$;

-- A trusted, tenant-scoped gateway calls service-role-only SQL functions.
-- Claims are atomic and leased; only one uncompleted health probe per tenant.
CREATE OR REPLACE FUNCTION public.claim_ruflo_probe(
 _tenant uuid,_product text,_region text,_worker text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.ai_ruflo_probe_tasks; binding public.ai_ruflo_tenant_bindings;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR _worker IS NULL OR
  _worker !~ '^[A-Za-z0-9_-]{8,80}$' OR _region !~ '^[A-Z]{2}$'
 THEN RAISE EXCEPTION 'Trusted Ruflo worker required'; END IF;
 SELECT * INTO item FROM public.ai_ruflo_probe_tasks
 WHERE tenant_id=_tenant AND product_key=_product AND data_region=_region
  AND status='queued'
 ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF item.id IS NULL THEN RETURN NULL; END IF;
 IF NOT public.ruflo_probe_gate(_tenant,_product,item.probe_key,_region) THEN
  UPDATE public.ai_ruflo_probe_tasks SET status='denied',error_code='policy_denied',
   completed_at=now() WHERE id=item.id;
  RETURN jsonb_build_object('status','denied');
 END IF;
 SELECT * INTO STRICT binding FROM public.ai_ruflo_tenant_bindings
 WHERE tenant_id=_tenant AND product_key=_product;
 UPDATE public.ai_ruflo_probe_tasks SET status='processing',
  attempts=attempts+1,claim_token=gen_random_uuid(),claimed_by=_worker,
  lease_expires_at=now()+interval '120 seconds',started_at=COALESCE(started_at,now())
 WHERE id=item.id RETURNING * INTO item;
 RETURN jsonb_build_object('taskId',item.id,'claimToken',item.claim_token,
  'toolName',item.probe_key,'expectedDigest',binding.executable_sha256,
  'upstreamVersion',binding.upstream_version,'dataRegion',item.data_region,
  'leaseExpiresAt',item.lease_expires_at);
END $$;

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
  'expectedDigest',binding.executable_sha256,'dataRegion',item.data_region,
  'leaseExpiresAt',item.lease_expires_at);
END $$;

CREATE OR REPLACE FUNCTION public.finish_ruflo_probe(
 _tenant uuid,_product text,_task uuid,_claim uuid,_worker text,
 _result text,_receipt_ref text,_error_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.ai_ruflo_probe_tasks; final_result text; ref_id uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR
   _result NOT IN('passed','failed','timed_out','denied') OR
   _receipt_ref IS NULL OR length(_receipt_ref) NOT BETWEEN 8 AND 160 OR
   _receipt_ref !~ '^[A-Za-z0-9_-]+$' OR
   (_error_code IS NOT NULL AND _error_code NOT IN('policy_denied','protocol_error','timeout','probe_error','lease_expired'))
 THEN RAISE EXCEPTION 'Invalid trusted Ruflo report'; END IF;
 SELECT * INTO STRICT item FROM public.ai_ruflo_probe_tasks
 WHERE id=_task AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 IF item.claim_token IS DISTINCT FROM _claim OR item.claimed_by IS DISTINCT FROM _worker
 THEN RAISE EXCEPTION 'Ruflo probe claim mismatch'; END IF;
 IF item.status IN('passed','failed','timed_out','denied') AND item.result_receipt_ref=_receipt_ref
 THEN RETURN jsonb_build_object('status',item.status,'alreadyExists',true); END IF;
 IF item.status<>'processing' THEN RAISE EXCEPTION 'Ruflo probe is not processing'; END IF;
 final_result:=_result;
 IF item.lease_expires_at<=now() OR NOT
   public.ruflo_probe_gate(_tenant,_product,item.probe_key,item.data_region)
 THEN final_result:='denied'; END IF;
 INSERT INTO public.ai_ruflo_probe_receipts(
  tenant_id,product_key,probe_key,result_status,worker_receipt_ref
 ) VALUES(_tenant,_product,item.probe_key,final_result,_receipt_ref)
 RETURNING id INTO ref_id;
 UPDATE public.ai_ruflo_probe_tasks SET status=final_result,
  error_code=CASE WHEN final_result='passed' THEN NULL
   WHEN final_result='denied' THEN 'policy_denied'
   ELSE COALESCE(_error_code,'probe_error') END,
  result_receipt_ref=_receipt_ref,completed_at=now(),lease_expires_at=NULL
 WHERE id=item.id;
 RETURN jsonb_build_object('status',final_result,'receiptId',ref_id,'alreadyExists',false);
END $$;

-- Optional trusted lease cleanup; expired probes are safely requeued once,
-- then terminally timed out. A late worker's old claim token is refused.
CREATE OR REPLACE FUNCTION public.reap_ruflo_probes(
 _tenant uuid,_product text
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.ai_ruflo_probe_tasks; total integer:=0;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role'
 THEN RAISE EXCEPTION 'Trusted Ruflo worker required'; END IF;
 FOR item IN SELECT * FROM public.ai_ruflo_probe_tasks
  WHERE tenant_id=_tenant AND product_key=_product AND status='processing'
   AND lease_expires_at<now()
  ORDER BY lease_expires_at LIMIT 10 FOR UPDATE SKIP LOCKED
 LOOP
  IF item.attempts>=2 OR NOT
    public.ruflo_probe_gate(_tenant,_product,item.probe_key,item.data_region) THEN
   UPDATE public.ai_ruflo_probe_tasks
    SET status='timed_out',error_code='lease_expired',completed_at=now(),
      claim_token=NULL,claimed_by=NULL,lease_expires_at=NULL
    WHERE id=item.id;
  ELSE
   UPDATE public.ai_ruflo_probe_tasks
    SET status='queued',claim_token=NULL,claimed_by=NULL,lease_expires_at=NULL
    WHERE id=item.id;
  END IF;
  total:=total+1;
 END LOOP;
 RETURN total;
END $$;

REVOKE ALL ON FUNCTION public.request_ruflo_probe(uuid,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_ruflo_probe(uuid,text,text,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.claim_ruflo_probe(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ruflo_probe(uuid,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.preflight_ruflo_probe(uuid,text,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preflight_ruflo_probe(uuid,text,uuid,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.finish_ruflo_probe(uuid,text,uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_ruflo_probe(uuid,text,uuid,uuid,text,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.reap_ruflo_probes(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reap_ruflo_probes(uuid,text) TO service_role;
COMMIT;
