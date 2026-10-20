-- Phase 4D: service-role-only bounded worker claim, metered provider settlement,
-- manual result review and safe cancellation. Never dispatch writes or tool calls.
BEGIN;

CREATE UNIQUE INDEX workforce_readonly_response_ref_uq
 ON public.ai_workforce_readonly_admissions(response_ref)
 WHERE response_ref IS NOT NULL;

CREATE FUNCTION public.claim_ai_workforce_readonly_jobs(
 _tenant uuid,_product text,_worker_ref text,_limit integer DEFAULT 1)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $claim$
DECLARE candidate record;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR _product<>'omniqora' OR
    _worker_ref IS NULL OR _worker_ref !~ '^[A-Za-z0-9_-]{8,80}$' OR
    _limit IS NULL OR _limit NOT BETWEEN 1 AND 2 THEN
  RAISE EXCEPTION 'Verified read-only worker service credential required';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.ai_workforce_readonly_pilots p
  WHERE p.tenant_id=_tenant AND p.product_key=_product AND p.enabled AND p.expires_at>now())
  OR NOT public.has_tenant_entitlement(_tenant,'omniqora.ai-workforce')
  OR NOT public.has_tenant_entitlement(_tenant,'omniqora.intelligence-runtime') THEN
  RAISE EXCEPTION 'Read-only pilot or tenant entitlements inactive';
 END IF;
 FOR candidate IN
  SELECT a.*,r.status AS run_status,r2.status AS reservation_status,
    r2.rate_version,r2.currency,j.status AS job_status
  FROM public.ai_workforce_readonly_admissions a
  JOIN public.intelligence_jobs j ON j.id=a.job_id AND j.tenant_id=a.tenant_id
   AND j.product_key=a.product_key AND j.job_type='ai-workforce.readonly'
  JOIN public.ai_agent_runs r ON r.id=a.run_id AND r.tenant_id=a.tenant_id
   AND r.product_key=a.product_key
  JOIN public.ai_budgeted_run_reservations r2 ON r2.id=a.reservation_id
   AND r2.run_id=a.run_id AND r2.tenant_id=a.tenant_id AND r2.product_key=a.product_key
  JOIN public.ai_employees e ON e.id=a.employee_id AND e.tenant_id=a.tenant_id
   AND e.product_key=a.product_key
  JOIN public.ai_employee_tasks t ON t.id=a.task_id AND t.employee_id=a.employee_id
   AND t.tenant_id=a.tenant_id AND t.product_key=a.product_key
  JOIN public.ai_workforce_readonly_sources s ON s.id=a.source_id
   AND s.tenant_id=a.tenant_id AND s.product_key=a.product_key
  JOIN public.ai_use_cases u ON u.id=r.use_case_id AND u.tenant_id=a.tenant_id
   AND u.product_key=a.product_key
  WHERE a.tenant_id=_tenant AND a.product_key=_product AND a.status='queued'
   AND j.status='queued' AND r.status='queued' AND r2.status='reserved'
   AND j.attempts=0 AND j.next_attempt_at<=now()
   AND a.admitted_at>=now()-interval '30 minutes'
   AND e.status='approved_configuration' AND e.revision=a.employee_revision
   AND t.status='approved_brief' AND t.revision=a.task_revision
   AND t.employee_revision=e.revision AND cardinality(t.requested_capabilities)=0
   AND s.status='approved' AND s.revision=a.source_revision AND s.expires_at>now()
   AND u.status IN('approved','pilot') AND u.approved_by IS NOT NULL
   AND u.owner_user_id IS DISTINCT FROM u.approved_by
   AND EXISTS(SELECT 1 FROM public.provider_bindings b WHERE b.tenant_id=a.tenant_id
    AND b.product_key=a.product_key AND b.provider_key=a.provider_key
    AND b.environment='production' AND b.status='active'
    AND b.last_verified_at BETWEEN now()-interval '24 hours' AND now())
   AND EXISTS(SELECT 1 FROM public.ai_reviewed_model_rates rate
    WHERE rate.provider_key=a.provider_key AND rate.model_key=a.model_key
     AND rate.rate_version=r2.rate_version AND rate.currency=r2.currency
     AND rate.status='approved' AND rate.evaluation_passed
     AND rate.verified_at BETWEEN now()-interval '30 days' AND now())
  ORDER BY a.admitted_at
  LIMIT _limit
  FOR UPDATE OF a,j,r,r2,e,t,s SKIP LOCKED
 LOOP
  UPDATE public.ai_workforce_readonly_admissions SET status='processing',
   worker_ref=_worker_ref WHERE id=candidate.id;
  UPDATE public.intelligence_jobs SET status='processing',attempts=1,
   worker_key_id=_worker_ref,started_at=now(),locked_at=now(),updated_at=now()
   WHERE id=candidate.job_id;
  UPDATE public.ai_agent_runs SET status='running',updated_at=now()
   WHERE id=candidate.run_id;
  RETURN NEXT jsonb_build_object(
   'admissionId',candidate.id,'tenantId',candidate.tenant_id,
   'productKey',candidate.product_key,'runId',candidate.run_id,
   'jobId',candidate.job_id,'employeeId',candidate.employee_id,
   'taskId',candidate.task_id,'sourceKey','omniqora.crm.leads-summary.v1',
   'sourceHash',candidate.snapshot_hash,'aggregate',candidate.source_snapshot,
   'providerKey',candidate.provider_key,'modelKey',candidate.model_key,
   'maxInputTokens',candidate.max_input_tokens,
   'maxOutputTokens',candidate.max_output_tokens,'rateVersion',candidate.rate_version,
   'sourceReadOnly',true,'allowedTools','[]'::jsonb,
   'humanReviewRequired',true);
 END LOOP;
END $claim$;

-- Success requires a complete, provider-metered, no-tool text result.
-- The independent worker must authenticate with service-role and a matching lease.
CREATE FUNCTION public.finish_ai_workforce_readonly_job(
 _tenant uuid,_product text,_admission uuid,_worker_ref text,_receipt jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $finish$
DECLARE
 a public.ai_workforce_readonly_admissions;j public.intelligence_jobs;
 r public.ai_agent_runs;b public.ai_budgeted_run_reservations;
 e public.ai_employees;t public.ai_employee_tasks;
 s public.ai_workforce_readonly_sources;p public.ai_workforce_readonly_pilots;
 rate public.ai_reviewed_model_rates;input_count bigint;cached_count bigint;output_count bigint;
 actual_minor bigint;receipt_ref text;summary_text text;settled jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR _worker_ref IS NULL OR
    _worker_ref !~ '^[A-Za-z0-9_-]{8,80}$' THEN
  RAISE EXCEPTION 'Verified workforce settlement operator required';
 END IF;
 SELECT * INTO STRICT a FROM public.ai_workforce_readonly_admissions
  WHERE id=_admission AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 SELECT * INTO STRICT j FROM public.intelligence_jobs
  WHERE id=a.job_id AND tenant_id=_tenant AND product_key=_product
   AND job_type='ai-workforce.readonly' FOR UPDATE;
 SELECT * INTO STRICT r FROM public.ai_agent_runs
  WHERE id=a.run_id AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 SELECT * INTO STRICT b FROM public.ai_budgeted_run_reservations
  WHERE id=a.reservation_id AND run_id=a.run_id
   AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 IF a.status<>'processing' OR j.status<>'processing' OR r.status<>'running'
  OR b.status<>'reserved' OR a.worker_ref IS DISTINCT FROM _worker_ref OR
  j.worker_key_id IS DISTINCT FROM _worker_ref THEN
  RAISE EXCEPTION 'Read-only job lease or reservation invalid';
 END IF;
 SELECT * INTO STRICT e FROM public.ai_employees
  WHERE id=a.employee_id AND tenant_id=_tenant AND product_key=_product;
 SELECT * INTO STRICT t FROM public.ai_employee_tasks
  WHERE id=a.task_id AND employee_id=e.id AND tenant_id=_tenant AND product_key=_product;
 SELECT * INTO STRICT s FROM public.ai_workforce_readonly_sources
  WHERE id=a.source_id AND tenant_id=_tenant AND product_key=_product;
 SELECT * INTO STRICT p FROM public.ai_workforce_readonly_pilots
  WHERE tenant_id=_tenant AND product_key=_product;
 IF p.enabled IS DISTINCT FROM true OR p.expires_at<=now() OR
   s.status<>'approved' OR s.expires_at<=now() OR s.revision<>a.source_revision OR
   e.status<>'approved_configuration' OR e.revision<>a.employee_revision OR
   t.status<>'approved_brief' OR t.revision<>a.task_revision OR
   t.employee_revision<>e.revision THEN
  RAISE EXCEPTION 'Data access, pilot or human approval revoked before settlement';
 END IF;
 IF _receipt IS NULL OR jsonb_typeof(_receipt)<>'object' OR
   length(_receipt::text)>7500 OR _receipt->>'sourceHash' IS DISTINCT FROM a.snapshot_hash
   OR _receipt->>'sourceKey' IS DISTINCT FROM 'omniqora.crm.leads-summary.v1'
   OR _receipt->>'dataOrigin' IS DISTINCT FROM 'first_party_crm_aggregate'
   OR _receipt->>'modelId' IS DISTINCT FROM a.model_key
   OR _receipt->>'modelCalls' IS DISTINCT FROM '1'
   OR _receipt->>'toolCalls' IS DISTINCT FROM '0'
   OR _receipt->>'customerActions' IS DISTINCT FROM '0'
   OR _receipt->>'reviewRequired' IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'Untrusted real CRM model receipt refused';
 END IF;
 summary_text:=_receipt->>'summary';
 receipt_ref:=_receipt->>'providerReceiptId';
 IF jsonb_typeof(_receipt->'summary') IS DISTINCT FROM 'string' OR
  length(btrim(COALESCE(summary_text,''))) NOT BETWEEN 20 AND 3500 OR
  receipt_ref IS NULL OR receipt_ref !~ '^resp_[A-Za-z0-9_-]{8,110}$' OR
  _receipt->>'inputTokens' IS NULL OR _receipt->>'outputTokens' IS NULL OR
  _receipt->>'cachedInputTokens' IS NULL OR
  _receipt->>'inputTokens' !~ '^[0-9]{1,7}$' OR
  _receipt->>'cachedInputTokens' !~ '^[0-9]{1,7}$' OR
  _receipt->>'outputTokens' !~ '^[0-9]{1,7}$' THEN
  RAISE EXCEPTION 'Incomplete model output or provider receipt';
 END IF;
 input_count:=(_receipt->>'inputTokens')::bigint;
 cached_count:=(_receipt->>'cachedInputTokens')::bigint;
 output_count:=(_receipt->>'outputTokens')::bigint;
 IF input_count NOT BETWEEN 1 AND a.max_input_tokens
  OR cached_count NOT BETWEEN 0 AND input_count
  OR output_count NOT BETWEEN 1 AND a.max_output_tokens THEN
  RAISE EXCEPTION 'Provider input/output exceeded approved limits';
 END IF;
 SELECT * INTO STRICT rate FROM public.ai_reviewed_model_rates
  WHERE provider_key=a.provider_key AND model_key=a.model_key
   AND rate_version=b.rate_version AND currency=b.currency
   AND status='approved' AND evaluation_passed;
 actual_minor:=ceil((input_count-cached_count)::numeric*rate.input_minor_per_million/1000000)::bigint
  +ceil(cached_count::numeric*COALESCE(rate.cached_input_minor_per_million,rate.input_minor_per_million)/1000000)::bigint
  +ceil(output_count::numeric*rate.output_minor_per_million/1000000)::bigint;
 IF actual_minor>b.reserved_minor OR actual_minor>p.max_run_cost_minor THEN
  RAISE EXCEPTION 'Reported token usage exceeds approved reservation';
 END IF;
 settled:=public.settle_budgeted_ai_agent(r.id,actual_minor,receipt_ref);
 IF settled->>'status'<>'settled' THEN
  RAISE EXCEPTION 'Canonical provider usage reconciliation failed';
 END IF;
 UPDATE public.ai_workforce_readonly_admissions
  SET status='waiting_review',response_ref=receipt_ref WHERE id=a.id;
 UPDATE public.ai_agent_runs SET status='waiting_review',
  result=jsonb_build_object('summary',btrim(summary_text),
    'dataOrigin','first_party_crm_aggregate','sourceKey',s.source_key,
    'sourceHash',a.snapshot_hash,'humanReviewed',false,
    'providerReceiptId',receipt_ref,'inputTokens',input_count,
    'cachedInputTokens',cached_count,
    'outputTokens',output_count,'meteredCostMinor',actual_minor),
  token_usage=jsonb_build_object('inputTokens',input_count,
    'cachedInputTokens',cached_count,'outputTokens',output_count),
  updated_at=now()
 WHERE id=r.id;
 UPDATE public.intelligence_jobs SET status='waiting_review',
  result=jsonb_build_object('summary',btrim(summary_text),'sourceKey',s.source_key,
    'sourceHash',a.snapshot_hash,'reviewRequired',true,
    'providerReceiptId',receipt_ref,'meteredCostMinor',actual_minor),
  provider_key=a.provider_key,model=a.model_key,locked_at=NULL,updated_at=now()
 WHERE id=j.id;
 RETURN jsonb_build_object('admissionId',a.id,'runId',r.id,
  'status','waiting_review','reviewRequired',true,
  'meteredCostMinor',actual_minor,'currency',b.currency,'modelCalls',1,
  'toolCalls',0,'customerActions',0);
END $finish$;

-- If the provider was contacted but no trustworthy receipt can be obtained,
-- HOLD the reservation for explicit reconciliation. Never record £0 fiction.
CREATE FUNCTION public.flag_ai_workforce_readonly_reconciliation(
 _tenant uuid,_product text,_admission uuid,_worker_ref text,_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $flag$
DECLARE a public.ai_workforce_readonly_admissions;j public.intelligence_jobs;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR
   length(btrim(COALESCE(_reason,''))) NOT BETWEEN 12 AND 200 THEN
  RAISE EXCEPTION 'Trusted reconciliation flag required';
 END IF;
 SELECT * INTO STRICT a FROM public.ai_workforce_readonly_admissions
  WHERE id=_admission AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 SELECT * INTO STRICT j FROM public.intelligence_jobs
  WHERE id=a.job_id AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 IF a.status<>'processing' OR j.status<>'processing' OR
   a.worker_ref IS DISTINCT FROM _worker_ref OR j.worker_key_id IS DISTINCT FROM _worker_ref THEN
  RAISE EXCEPTION 'Unverified worker reconciliation request';
 END IF;
 UPDATE public.ai_workforce_readonly_admissions
  SET status='reconciliation_required',finished_at=now() WHERE id=a.id;
 UPDATE public.intelligence_jobs SET status='waiting_review',locked_at=NULL,
  last_error='Model usage reconciliation required',updated_at=now() WHERE id=j.id;
 UPDATE public.ai_agent_runs SET status='waiting_review',updated_at=now()
 WHERE id=a.run_id;
 RETURN jsonb_build_object('admissionId',a.id,
  'status','reconciliation_required','reservationHeld',true);
END $flag$;

CREATE FUNCTION public.review_ai_workforce_readonly_result(
 _tenant uuid,_product text,_admission uuid,_decision text,_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $review$
DECLARE a public.ai_workforce_readonly_admissions;j public.intelligence_jobs;
BEGIN
 PERFORM public.ai_workforce_require_admin(_tenant,_product);
 SELECT * INTO STRICT a FROM public.ai_workforce_readonly_admissions
  WHERE id=_admission AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 SELECT * INTO STRICT j FROM public.intelligence_jobs
  WHERE id=a.job_id AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 IF a.status<>'waiting_review' OR j.status<>'waiting_review'
   OR a.requested_by=auth.uid() OR _decision NOT IN('accepted','rejected') OR
   length(btrim(COALESCE(_note,''))) NOT BETWEEN 12 AND 1000 THEN
  RAISE EXCEPTION 'Independent human result review required';
 END IF;
 UPDATE public.ai_workforce_readonly_admissions
  SET status=CASE WHEN _decision='accepted' THEN 'completed' ELSE 'rejected' END,
   review_by=auth.uid(),review_note=btrim(_note),reviewed_at=now(),finished_at=now()
 WHERE id=a.id;
 UPDATE public.ai_agent_runs
  SET status=CASE WHEN _decision='accepted' THEN 'completed' ELSE 'failed' END,
   result=result||jsonb_build_object('humanReviewed',true,'reviewDecision',_decision),
   completed_at=now(),updated_at=now()
 WHERE id=a.run_id;
 UPDATE public.intelligence_jobs
  SET status=CASE WHEN _decision='accepted' THEN 'completed' ELSE 'failed' END,
   completed_at=now(),updated_at=now() WHERE id=j.id;
 RETURN jsonb_build_object('admissionId',a.id,'decision',_decision,
  'humanReviewed',true,'customerActions',0);
END $review$;

CREATE FUNCTION public.cancel_ai_workforce_readonly_queued(
 _tenant uuid,_product text,_admission uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $cancel$
DECLARE a public.ai_workforce_readonly_admissions; original jsonb;
BEGIN
 PERFORM public.ai_workforce_require_admin(_tenant,_product);
 SELECT * INTO STRICT a FROM public.ai_workforce_readonly_admissions
  WHERE id=_admission AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 IF a.status<>'queued' THEN RAISE EXCEPTION 'Only unclaimed CRM analysis can be cancelled'; END IF;
 original:=public.cancel_budgeted_ai_agent(_tenant,a.run_id);
 IF original->>'alreadyCancelled'='true' OR original->>'runId' IS DISTINCT FROM a.run_id::text THEN
  RAISE EXCEPTION 'Canonical budget cancellation not confirmed';
 END IF;
 UPDATE public.ai_workforce_readonly_admissions
 SET status='cancelled',finished_at=now() WHERE id=a.id;
 RETURN jsonb_build_object('admissionId',a.id,'status','cancelled',
  'canonicalBudgetReleased',true);
END $cancel$;

REVOKE ALL ON FUNCTION public.claim_ai_workforce_readonly_jobs(uuid,text,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finish_ai_workforce_readonly_job(uuid,text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.flag_ai_workforce_readonly_reconciliation(uuid,text,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.review_ai_workforce_readonly_result(uuid,text,uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.cancel_ai_workforce_readonly_queued(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_ai_workforce_readonly_jobs(uuid,text,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_ai_workforce_readonly_job(uuid,text,uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.flag_ai_workforce_readonly_reconciliation(uuid,text,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_ai_workforce_readonly_result(uuid,text,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_ai_workforce_readonly_queued(uuid,text,uuid) TO authenticated;

COMMIT;
