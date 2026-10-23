-- Phase 4D: real, strictly aggregated, consented first-party CRM snapshot
-- with existing Agent Factory budget admission. No user-selected SQL/tools/URLs.
BEGIN;

CREATE FUNCTION public.queue_ai_workforce_readonly_analysis(
 _tenant uuid,_product text,_employee uuid,_task uuid,_source uuid,
 _provider text,_model text,_currency text,
 _input_tokens integer,_output_tokens integer,_idempotency uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $queue$
DECLARE
 p public.ai_workforce_readonly_pilots;s public.ai_workforce_readonly_sources;
 e public.ai_employees;t public.ai_employee_tasks;uc public.ai_use_cases;
 a public.ai_workforce_readonly_admissions;
 queued jsonb;current_day integer; source_total integer;qualified_count integer;
 converted_count integer;working_count integer;has_small_group boolean;details jsonb;h text;request_fingerprint text;
 tenant_country text; approved_regions text[];
 run_uuid uuid;job_uuid uuid;reservation_uuid uuid;new_id uuid;
BEGIN
 PERFORM public.ai_workforce_require_admin(_tenant,_product);
 IF _product<>'omniqora' OR _idempotency IS NULL OR
    _provider IS DISTINCT FROM 'openai' OR
    _model IS NULL OR _model !~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{2,99}$' OR
    _currency NOT IN('GBP','EUR','USD') OR
    _input_tokens IS NULL OR _input_tokens NOT BETWEEN 256 AND 1200 OR
    _output_tokens IS NULL OR _output_tokens NOT BETWEEN 64 AND 256 THEN
  RAISE EXCEPTION 'Unsupported bounded CRM analysis request';
 END IF;
 SELECT * INTO STRICT p FROM public.ai_workforce_readonly_pilots
  WHERE tenant_id=_tenant AND product_key=_product FOR UPDATE;
 IF p.enabled IS DISTINCT FROM true OR p.expires_at<=now() THEN
  RAISE EXCEPTION 'Real CRM read-only pilot is not approved or expired';
 END IF;
 IF NOT public.has_tenant_entitlement(_tenant,'omniqora.intelligence-runtime') THEN
  RAISE EXCEPTION 'AI runtime entitlement required';
 END IF;
 SELECT * INTO STRICT e FROM public.ai_employees
  WHERE id=_employee AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 SELECT * INTO STRICT t FROM public.ai_employee_tasks
  WHERE id=_task AND employee_id=e.id AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 SELECT * INTO STRICT s FROM public.ai_workforce_readonly_sources
  WHERE id=_source AND tenant_id=_tenant AND product_key=_product FOR SHARE;
 IF s.status<>'approved' OR s.expires_at<=now() OR s.reviewed_at IS NULL OR
    s.reviewer_id IS NULL OR s.requester_id=s.reviewer_id OR
    s.classification<>'aggregate_internal' OR
    s.source_key<>'omniqora.crm.leads-summary.v1' THEN
  RAISE EXCEPTION 'Independently approved current CRM aggregate access required';
 END IF;
 IF e.status<>'approved_configuration' OR e.reviewed_by IS NULL OR
    e.reviewed_by IN(e.created_by,e.last_edited_by) OR
    t.status<>'approved_brief' OR t.reviewed_by IS NULL OR
    t.reviewed_by IN(t.created_by,t.last_edited_by) OR
    t.employee_revision<>e.revision OR
    t.proposed_trigger->>'enabled' IS DISTINCT FROM 'false' OR
    cardinality(t.requested_capabilities)<>0 THEN
  RAISE EXCEPTION 'Approved current no-tool employee and task brief required';
 END IF;
 SELECT * INTO uc FROM public.ai_use_cases
 WHERE tenant_id=_tenant AND product_key=_product AND use_case_key=e.blueprint_key;
 IF uc.id IS NULL OR uc.status NOT IN('approved','pilot') OR uc.approved_by IS NULL
  OR uc.owner_user_id IS NOT DISTINCT FROM uc.approved_by
  OR uc.provider_route->>'factoryBlueprint' IS DISTINCT FROM e.blueprint_key
  OR NOT uc.allowed_tools <@ ARRAY['crm.read','analytics.read']::text[] THEN
  RAISE EXCEPTION 'Independently approved read-only Agent Factory use case required';
 END IF;
 -- The generic Agent Factory allows an empty country list. This real-data
 -- pilot requires an explicit approval for the tenant's actual country on
 -- the latest evaluated model tariff; absence does not mean unrestricted.
 SELECT country_code INTO STRICT tenant_country FROM public.tenants WHERE id=_tenant;
 SELECT supported_regions INTO approved_regions FROM public.ai_reviewed_model_rates
 WHERE provider_key=_provider AND model_key=_model AND currency=_currency
  AND status='approved' AND evaluation_passed
  AND verified_at BETWEEN now()-interval '30 days' AND now()
 ORDER BY verified_at DESC,rate_version DESC LIMIT 1;
 IF approved_regions IS NULL OR cardinality(approved_regions)=0 OR
   NOT COALESCE(tenant_country=ANY(approved_regions),false) THEN
  RAISE EXCEPTION 'Latest model tariff lacks verified tenant-country clearance';
 END IF;

 request_fingerprint:=md5(concat_ws(':',_tenant::text,_product,e.id::text,t.id::text,
    e.revision::text,t.revision::text,s.id::text,s.revision::text,_provider,_model,
    _currency,_input_tokens::text,_output_tokens::text));
 SELECT * INTO a FROM public.ai_workforce_readonly_admissions
  WHERE tenant_id=_tenant AND product_key=_product AND idempotency_key=_idempotency;
 IF a.id IS NOT NULL THEN
  IF a.request_hash<>request_fingerprint THEN
   RAISE EXCEPTION 'Read-only job idempotency payload changed';
  END IF;
  RETURN jsonb_build_object('admissionId',a.id,'runId',a.run_id,'jobId',a.job_id,
   'status',a.status,'alreadyExists',true,'humanReviewRequired',true);
 END IF;
 SELECT count(*) INTO current_day FROM public.ai_workforce_readonly_admissions a0
 WHERE a0.tenant_id=_tenant AND a0.product_key=_product
   AND a0.admitted_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
 IF current_day>=p.daily_limit THEN RAISE EXCEPTION 'Daily CRM model pilot quota exceeded'; END IF;

 -- Source authority is the tenant's first-party CRM. No leads, contacts, IDs,
 -- names, emails, numbers, descriptions, text or underlying rows leave the DB.
 SELECT count(*)::integer,
  count(*) FILTER(WHERE status='qualified')::integer,
  count(*) FILTER(WHERE status='converted')::integer,
  count(*) FILTER(WHERE status='working')::integer
 INTO source_total,qualified_count,converted_count,working_count
 FROM public.crm_leads
 WHERE tenant_id=_tenant AND (source_product_key IS NULL OR source_product_key='omniqora');
 IF source_total<10 THEN
  RAISE EXCEPTION 'Insufficient CRM records for privacy-safe aggregate';
 END IF;
 -- A hidden group could otherwise be inferred by subtracting visible
 -- status counts from the total. Coarsen the ENTIRE category breakdown if
 -- ANY nonempty status has fewer than five records, including unlisted statuses.
 SELECT EXISTS(SELECT 1 FROM (
   SELECT status,count(*) AS n FROM public.crm_leads
   WHERE tenant_id=_tenant AND (source_product_key IS NULL OR source_product_key='omniqora')
   GROUP BY status
 ) small_groups WHERE small_groups.n BETWEEN 1 AND 4) INTO has_small_group;
 details:=jsonb_build_object(
  'sourceKey',s.source_key,
  'origin','first_party_crm_aggregate',
  'dataClass','aggregate_internal',
  'totalLeads',source_total,
  'qualifiedLeads',CASE WHEN NOT has_small_group AND qualified_count>=5 THEN to_jsonb(qualified_count) ELSE 'null'::jsonb END,
  'convertedLeads',CASE WHEN NOT has_small_group AND converted_count>=5 THEN to_jsonb(converted_count) ELSE 'null'::jsonb END,
  'workingLeads',CASE WHEN NOT has_small_group AND working_count>=5 THEN to_jsonb(working_count) ELSE 'null'::jsonb END,
  'smallGroupsSuppressed',true,
  'asOfUtc',to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'));
 h:=md5(details::text);
 queued:=public.queue_budgeted_ai_agent(
  _tenant,_product,uc.id,'operations',
  'Prepare a human-reviewed read-only CRM lead funnel summary from a consented aggregate snapshot',
  _provider,_model,_currency,_input_tokens,0,_output_tokens,0,1,_idempotency);
 IF (queued->>'reservedMinor')::bigint>p.max_run_cost_minor THEN
  RAISE EXCEPTION 'Pilot per-run cost ceiling exceeded';
 END IF;
 run_uuid:=(queued->>'runId')::uuid;job_uuid:=(queued->>'jobId')::uuid;
 reservation_uuid:=(queued->>'reservationId')::uuid;
 IF run_uuid IS NULL OR job_uuid IS NULL OR reservation_uuid IS NULL THEN
  RAISE EXCEPTION 'Canonical budgeted task did not create all required ledgers';
 END IF;
 -- Only the dedicated verified employee worker can claim these jobs.
 UPDATE public.intelligence_jobs
 SET job_type='ai-workforce.readonly',
     requirements=jsonb_build_object(
      'readOnly',true,'noTools',true,'noExternalActions',true,
      'humanReviewRequired',true,'approvedSourceId',s.id,
      'snapshotDigest',h,'budgetReservationId',reservation_uuid,
      'maxInputTokens',_input_tokens,'maxOutputTokens',_output_tokens,
      'sourceDataClass','aggregate_internal'),
     input=jsonb_build_object('runId',run_uuid,'employeeId',e.id,'taskId',t.id,
      'sourceKey',s.source_key,'sourceDigest',h,
      'providerKey',_provider,'modelKey',_model,
      'maxInputTokens',_input_tokens,'maxOutputTokens',_output_tokens)
 WHERE id=job_uuid AND tenant_id=_tenant AND product_key=_product
   AND subject_type='ai_agent_run' AND subject_id=run_uuid::text AND status='queued';
 IF NOT FOUND THEN RAISE EXCEPTION 'Canonical AI job was not safely reserved'; END IF;
 INSERT INTO public.ai_workforce_readonly_admissions
 (tenant_id,product_key,employee_id,task_id,source_id,employee_revision,task_revision,
  source_revision,run_id,job_id,reservation_id,provider_key,model_key,
  max_input_tokens,max_output_tokens,source_snapshot,snapshot_hash,
  idempotency_key,request_hash,requested_by)
 VALUES(_tenant,_product,e.id,t.id,s.id,e.revision,t.revision,s.revision,
  run_uuid,job_uuid,reservation_uuid,_provider,_model,
  _input_tokens,_output_tokens,details,h,_idempotency,request_fingerprint,auth.uid())
 RETURNING id INTO new_id;
 RETURN jsonb_build_object('admissionId',new_id,'runId',run_uuid,'jobId',job_uuid,
  'reservationId',reservation_uuid,'status','queued','alreadyExists',false,
  'humanReviewRequired',true,'sourceKey',s.source_key);
END $queue$;

-- Replace only the generic service claim query's filter. Never dispatch
-- read-only workforce jobs to unrelated generic AI runners.
CREATE OR REPLACE FUNCTION public.claim_intelligence_jobs_for_scope(
 _tenant uuid,_product text,_limit integer DEFAULT 10,_job_types text[] DEFAULT NULL,_worker_key text DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
BEGIN
 RETURN QUERY
 WITH jobs AS(
  SELECT j.id FROM public.intelligence_jobs j
  WHERE j.tenant_id=_tenant AND j.product_key=_product
    AND ((j.status='queued' AND j.next_attempt_at<=now()) OR (j.status='processing' AND j.locked_at<now()-interval '10 minutes'))
    AND j.job_type NOT IN ('ai-workforce.fixture','ai-workforce.readonly')
    AND (_job_types IS NULL OR j.job_type=ANY(_job_types))
  ORDER BY CASE j.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,j.created_at
  LIMIT LEAST(GREATEST(_limit,1),50)
  FOR UPDATE SKIP LOCKED
 )
 UPDATE public.intelligence_jobs j
 SET status='processing',attempts=j.attempts+1,locked_at=now(),started_at=COALESCE(j.started_at,now()),worker_key_id=_worker_key,updated_at=now()
 FROM jobs x WHERE j.id=x.id
 RETURNING jsonb_build_object('id',j.id,'tenantId',j.tenant_id,'productKey',j.product_key,'jobType',j.job_type,
  'subjectType',j.subject_type,'subjectId',j.subject_id,'priority',j.priority,'input',j.input,'requirements',j.requirements,'attempts',j.attempts);
END; $$;


REVOKE ALL ON FUNCTION public.claim_intelligence_jobs_for_scope(uuid,text,integer,text[],text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_intelligence_jobs_for_scope(uuid,text,integer,text[],text) TO service_role;

REVOKE ALL ON FUNCTION public.queue_ai_workforce_readonly_analysis(uuid,text,uuid,uuid,uuid,text,text,text,integer,integer,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.queue_ai_workforce_readonly_analysis(uuid,text,uuid,uuid,uuid,text,text,text,integer,integer,uuid) TO authenticated;

COMMIT;
