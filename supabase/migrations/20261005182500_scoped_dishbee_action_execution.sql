BEGIN;
-- Unpredictable attempt token fences stale workers; retain it for exact replay checks.
ALTER TABLE public.ai_action_requests ADD COLUMN IF NOT EXISTS claim_token uuid;
ALTER TABLE public.ai_action_proposals ADD COLUMN IF NOT EXISTS reviewed_actor_ref text;

CREATE OR REPLACE FUNCTION public.product_action_execution_enabled(t uuid,p text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT COALESCE(p='dishbee' AND EXISTS(SELECT 1 FROM public.tenant_products
  WHERE tenant_id=t AND product_key=p AND status='active' AND config->'actionExecutionEnabled'='true'::jsonb)
  AND public.has_tenant_entitlement(t,'omniqora.intelligence-runtime')
  AND EXISTS(SELECT 1 FROM public.tenant_services WHERE tenant_id=t AND service_key='omniqora.intelligence-runtime'
    AND status IN('active','trial') AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now())),false);
$$;
REVOKE ALL ON FUNCTION public.product_action_execution_enabled(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

-- Never create or reactivate an execution binding as a side effect of approval.
CREATE OR REPLACE FUNCTION public.ensure_product_action_tool_binding(_tenant uuid,_product text,_tool_key text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT b.id FROM public.ai_tool_bindings b JOIN public.product_action_tool_catalogue c
 ON c.product_key=b.product_key AND c.tool_key=b.tool_key
 WHERE b.tenant_id=_tenant AND b.product_key=_product AND b.tool_key=_tool_key
 AND b.active AND c.active AND b.destination_ref='dishbee.runtime'
 AND c.destination_ref=b.destination_ref AND b.approval_mode='always'
 AND public.product_action_execution_enabled(_tenant,_product);
$$;
REVOKE ALL ON FUNCTION public.ensure_product_action_tool_binding(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;

DROP FUNCTION IF EXISTS public.queue_approved_action_proposal(uuid,text);
CREATE FUNCTION public.queue_approved_action_proposal(_tenant uuid,_product text,_proposal uuid,_actor_ref text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.ai_action_proposals%rowtype; b uuid; r uuid;
BEGIN
 IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 IF public.product_action_execution_enabled(_tenant,_product) IS NOT TRUE THEN RAISE EXCEPTION 'Action execution is not explicitly enabled'; END IF;
 SELECT * INTO p FROM public.ai_action_proposals WHERE id=_proposal AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 IF NOT FOUND OR p.status<>'approved' THEN RAISE EXCEPTION 'Approved scoped proposal required'; END IF;
 IF p.action_request_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.ai_action_requests WHERE id=p.action_request_id AND tenant_id=_tenant AND product_key=_product AND source_proposal_id=p.id)
   THEN RAISE EXCEPTION 'Action request scope mismatch'; END IF;
  RETURN jsonb_build_object('queued',true,'actionRequestId',p.action_request_id,'duplicate',true);
 END IF;
 b:=public.ensure_product_action_tool_binding(_tenant,_product,p.action_key);
 IF b IS NULL THEN RETURN jsonb_build_object('queued',false,'supported',false,'reason','explicit_active_tool_binding_required'); END IF;
 INSERT INTO public.ai_action_requests(tenant_id,product_key,tool_binding_id,action_type,subject_type,subject_id,
   proposed_payload,status,requested_by,reviewed_by,reviewed_at,source_proposal_id)
 VALUES(_tenant,_product,b,p.action_key,p.target_type,p.target_id,p.payload,'approved',
   'ai-proposal:'||p.id::text,p.reviewed_by,p.reviewed_at,p.id)
 ON CONFLICT(source_proposal_id) WHERE source_proposal_id IS NOT NULL DO NOTHING RETURNING id INTO r;
 IF r IS NULL THEN SELECT id INTO r FROM public.ai_action_requests WHERE source_proposal_id=p.id AND tenant_id=_tenant AND product_key=_product; END IF;
 IF r IS NULL THEN RAISE EXCEPTION 'Action request scope mismatch'; END IF;
 UPDATE public.ai_action_proposals SET action_request_id=r WHERE id=p.id;
 RETURN jsonb_build_object('queued',true,'supported',true,'actionRequestId',r);
END $$;
REVOKE ALL ON FUNCTION public.queue_approved_action_proposal(uuid,text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.review_product_action_proposal(_tenant uuid,_product text,_proposal uuid,_decision text,_actor_ref text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.ai_action_proposals%rowtype; q jsonb:='{"queued":false}'::jsonb;
BEGIN
 IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 IF _decision IS NULL OR _decision NOT IN('approved','rejected') OR length(btrim(COALESCE(_actor_ref,''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid action review'; END IF;
 IF public.product_action_execution_enabled(_tenant,_product) IS NOT TRUE THEN RAISE EXCEPTION 'Action execution is not explicitly enabled'; END IF;
 SELECT * INTO p FROM public.ai_action_proposals WHERE id=_proposal AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Scoped action proposal not found'; END IF;
 IF p.status NOT IN('pending',_decision) THEN RAISE EXCEPTION 'Action proposal already decided'; END IF;
 IF p.status='pending' THEN
  UPDATE public.ai_action_proposals SET status=_decision,reviewed_at=now(),reviewed_actor_ref=_actor_ref
  WHERE id=p.id RETURNING * INTO p;
 END IF;
 IF _decision='approved' THEN q:=public.queue_approved_action_proposal(_tenant,_product,p.id,_actor_ref); END IF;
 RETURN jsonb_build_object('id',p.id,'status',p.status,'execution',q);
END $$;
REVOKE ALL ON FUNCTION public.review_product_action_proposal(uuid,text,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.review_product_action_proposal(uuid,text,uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_product_action_requests(_tenant uuid,_product text,_destination text,_worker text,_limit integer DEFAULT 20)
RETURNS SETOF public.ai_action_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 IF _destination IS DISTINCT FROM 'dishbee.runtime' OR length(COALESCE(_worker,'')) NOT BETWEEN 4 AND 300 THEN RAISE EXCEPTION 'Action worker scope refused'; END IF;
 IF public.product_action_execution_enabled(_tenant,_product) IS NOT TRUE THEN RAISE EXCEPTION 'Action execution is not explicitly enabled'; END IF;
 -- Exhausted crashed attempts have an unknown external outcome: never silently retry them.
 UPDATE public.ai_action_requests SET status='failed',error_message='execution_outcome_unknown_manual_reconciliation',locked_at=NULL,updated_at=now()
 WHERE tenant_id=_tenant AND product_key=_product AND status='executing' AND attempts>=8 AND locked_at<now()-interval '10 minutes';
 RETURN QUERY WITH picked AS (
  SELECT a.id FROM public.ai_action_requests a
  JOIN public.ai_tool_bindings b ON b.id=a.tool_binding_id AND b.tenant_id=a.tenant_id AND b.product_key=a.product_key
  JOIN public.product_action_tool_catalogue c ON c.product_key=b.product_key AND c.tool_key=b.tool_key AND c.active
  JOIN public.ai_action_proposals p ON p.id=a.source_proposal_id AND p.tenant_id=a.tenant_id AND p.product_key=a.product_key
  WHERE a.tenant_id=_tenant AND a.product_key=_product AND a.attempts<8 AND p.status='approved'
   AND a.reviewed_at IS NOT NULL AND p.reviewed_at IS NOT NULL
   AND a.action_type=b.tool_key AND p.action_key=b.tool_key AND a.proposed_payload=p.payload
   AND a.subject_type=p.target_type AND a.subject_id IS NOT DISTINCT FROM p.target_id
   AND b.active AND b.destination_ref=_destination AND c.destination_ref=_destination AND b.approval_mode='always'
   AND ((a.status IN('approved','failed') AND a.next_attempt_at<=now() AND a.locked_at IS NULL)
     OR (a.status='executing' AND a.locked_at<now()-interval '10 minutes'))
  ORDER BY a.created_at FOR UPDATE OF a SKIP LOCKED LIMIT greatest(1,least(COALESCE(_limit,20),100))
 ) UPDATE public.ai_action_requests a SET status='executing',attempts=a.attempts+1,locked_at=now(),locked_by=_worker,claim_token=gen_random_uuid(),updated_at=now()
 FROM picked WHERE a.id=picked.id RETURNING a.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_product_action_requests(uuid,text,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_product_action_requests(uuid,text,text,text,integer) TO service_role;

-- Retire the unscoped signature: possession of an action UUID grants no authority.
DROP FUNCTION IF EXISTS public.finish_product_action_request(uuid,boolean,text,jsonb,text);
CREATE FUNCTION public.finish_product_action_request(_tenant uuid,_product text,_destination text,_worker text,_claim_token uuid,
 _action uuid,_success boolean,_execution_ref text DEFAULT NULL,_result jsonb DEFAULT '{}'::jsonb,_error text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.ai_action_requests%rowtype; expected_error text; outcome text;
BEGIN
 IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 IF public.product_action_execution_enabled(_tenant,_product) IS NOT TRUE THEN RAISE EXCEPTION 'Action execution is not explicitly enabled'; END IF;
 IF _success IS NULL OR _claim_token IS NULL OR _result IS NULL OR jsonb_typeof(_result)<>'object' OR octet_length(_result::text)>32768
   OR length(COALESCE(_worker,'')) NOT BETWEEN 4 AND 300 THEN RAISE EXCEPTION 'Invalid action completion'; END IF;
 SELECT a0.* INTO a FROM public.ai_action_requests a0 JOIN public.ai_tool_bindings b ON b.id=a0.tool_binding_id
 WHERE a0.id=_action AND a0.tenant_id=_tenant AND a0.product_key=_product AND b.tenant_id=_tenant AND b.product_key=_product
  AND b.destination_ref=_destination AND _destination='dishbee.runtime' AND b.active AND b.tool_key=a0.action_type
  AND b.approval_mode='always' AND EXISTS(SELECT 1 FROM public.product_action_tool_catalogue c WHERE c.product_key=_product AND c.tool_key=b.tool_key AND c.active AND c.destination_ref=_destination)
 FOR UPDATE OF a0;
 IF NOT FOUND OR a.claim_token IS DISTINCT FROM _claim_token OR a.locked_by IS DISTINCT FROM _worker THEN RAISE EXCEPTION 'Action completion scope or claim refused'; END IF;
 expected_error:=CASE WHEN _success THEN NULL ELSE left(COALESCE(_error,'action_execution_failed'),2000) END;
 outcome:=CASE WHEN _success THEN 'succeeded' ELSE 'failed' END;
 IF a.status IN('succeeded','failed') AND a.locked_at IS NULL THEN
  IF a.status=outcome AND a.execution_result=_result AND a.execution_ref IS NOT DISTINCT FROM nullif(btrim(_execution_ref),'') AND a.error_message IS NOT DISTINCT FROM expected_error THEN RETURN true; END IF;
  RAISE EXCEPTION 'Conflicting action completion replay';
 END IF;
 IF a.status<>'executing' OR a.locked_at IS NULL OR a.locked_at<now()-interval '10 minutes' THEN RAISE EXCEPTION 'Action claim expired'; END IF;
 PERFORM 1 FROM public.ai_action_proposals p WHERE p.id=a.source_proposal_id AND p.tenant_id=_tenant AND p.product_key=_product
  AND p.status='approved' AND p.action_key=a.action_type AND p.payload=a.proposed_payload
  AND p.target_type=a.subject_type AND p.target_id IS NOT DISTINCT FROM a.subject_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Action proposal scope or approval changed'; END IF;
 UPDATE public.ai_action_requests SET status=outcome,execution_ref=nullif(btrim(_execution_ref),''),execution_result=_result,error_message=expected_error,
  next_attempt_at=CASE WHEN _success OR attempts>=8 THEN next_attempt_at ELSE now()+make_interval(mins=>least(60,(2^least(attempts,5))::integer)) END,
  locked_at=NULL,updated_at=now() WHERE id=a.id;
 UPDATE public.ai_action_proposals SET status=CASE WHEN _success THEN 'executed' WHEN a.attempts>=8 THEN 'failed' ELSE 'approved' END,
  executed_at=CASE WHEN _success THEN now() ELSE executed_at END,execution_result=_result
 WHERE id=a.source_proposal_id AND tenant_id=_tenant AND product_key=_product;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.finish_product_action_request(uuid,text,text,text,uuid,uuid,boolean,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_product_action_request(uuid,text,text,text,uuid,uuid,boolean,text,jsonb,text) TO service_role;
COMMIT;
