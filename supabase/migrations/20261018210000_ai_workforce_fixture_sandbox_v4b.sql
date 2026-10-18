-- Omniqora AI Workforce 4B: synthetic-only read-only task rehearsal.
-- No models, external APIs, customer records, scripts, cron or payments.
-- Parent migrations: 20261018110000 and 20261018130000.
BEGIN;

CREATE TABLE public.ai_workforce_sandbox_pilots (
 tenant_id uuid NOT NULL,
 product_key text NOT NULL,
 enabled boolean NOT NULL DEFAULT false,
 expires_at timestamptz NOT NULL,
 daily_limit integer NOT NULL DEFAULT 5 CHECK(daily_limit BETWEEN 1 AND 20),
 allowed_fixtures text[] NOT NULL DEFAULT ARRAY['fixture.crm.pipeline']::text[],
 operator_reference text NOT NULL CHECK(length(btrim(operator_reference)) BETWEEN 12 AND 200),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,product_key),
 FOREIGN KEY (tenant_id,product_key) REFERENCES public.tenant_products(tenant_id,product_key) ON DELETE CASCADE,
 CHECK (cardinality(allowed_fixtures) BETWEEN 1 AND 3),
 CHECK (allowed_fixtures <@ ARRAY['fixture.crm.pipeline','fixture.dishbee.orders','fixture.finance.cashflow']::text[])
);

CREATE TABLE public.ai_workforce_sandbox_admissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 product_key text NOT NULL,
 employee_id uuid NOT NULL,
 task_id uuid NOT NULL,
 job_id uuid NOT NULL UNIQUE REFERENCES public.intelligence_jobs(id) ON DELETE RESTRICT,
 employee_revision integer NOT NULL CHECK(employee_revision>0),
 task_revision integer NOT NULL CHECK(task_revision>0),
 fixture_key text NOT NULL CHECK(fixture_key IN
   ('fixture.crm.pipeline','fixture.dishbee.orders','fixture.finance.cashflow')),
 idempotency_key uuid NOT NULL,
 request_hash text NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN
   ('queued','processing','completed','failed','cancelled')),
 admitted_by uuid NOT NULL REFERENCES auth.users(id),
 worker_ref text,
 receipt_fingerprint text CHECK(receipt_fingerprint IS NULL OR receipt_fingerprint ~ '^[a-f0-9]{32}$'),
 admitted_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 FOREIGN KEY (employee_id,tenant_id,product_key)
  REFERENCES public.ai_employees(id,tenant_id,product_key) ON DELETE CASCADE,
 FOREIGN KEY (task_id,tenant_id,product_key)
  REFERENCES public.ai_employee_tasks(id,tenant_id,product_key) ON DELETE CASCADE,
 UNIQUE(tenant_id,product_key,idempotency_key)
);
CREATE INDEX ai_workforce_sandbox_admission_scope_idx
 ON public.ai_workforce_sandbox_admissions(tenant_id,product_key,employee_id,admitted_at DESC);
CREATE INDEX ai_workforce_sandbox_pending_idx
 ON public.ai_workforce_sandbox_admissions(tenant_id,product_key,status,admitted_at);

DO $security$ DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['ai_workforce_sandbox_pilots','ai_workforce_sandbox_admissions'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',tab);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',tab);
  EXECUTE format($p$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
   public.is_platform_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.tenant_members m
    WHERE m.tenant_id=%I.tenant_id AND m.user_id=auth.uid()
     AND m.role IN('owner','admin'))
  )$p$,'ai workforce sandbox admin read '||tab,tab,tab);
 END LOOP;
END $security$;

-- A service-role operator must explicitly open a time-limited pilot.
-- No tenant is enabled or fixture seeded by migration.
CREATE FUNCTION public.configure_ai_workforce_sandbox_pilot(
 _tenant uuid,_product text,_enabled boolean,_expires_at timestamptz,
 _daily_limit integer,_allowed_fixtures text[],_operator_reference text)
RETURNS public.ai_workforce_sandbox_pilots
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $pilot$
DECLARE saved public.ai_workforce_sandbox_pilots;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
   RAISE EXCEPTION 'Privileged sandbox operator required';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tenant_products p
    WHERE p.tenant_id=_tenant AND p.product_key=_product AND p.status='active') THEN
   RAISE EXCEPTION 'Active pilot product required';
 END IF;
 IF NOT public.has_tenant_entitlement(_tenant,'omniqora.ai-workforce') THEN
   RAISE EXCEPTION 'Workforce entitlement required';
 END IF;
 IF _enabled IS NULL OR _expires_at IS NULL OR
    (_enabled AND (_expires_at<=now() OR _expires_at>now()+interval '7 days')) OR
    _daily_limit IS NULL OR _daily_limit NOT BETWEEN 1 AND 20 OR
    _allowed_fixtures IS NULL OR cardinality(_allowed_fixtures) NOT BETWEEN 1 AND 3 OR
    NOT (_allowed_fixtures <@ ARRAY['fixture.crm.pipeline','fixture.dishbee.orders','fixture.finance.cashflow']::text[]) OR
    length(btrim(COALESCE(_operator_reference,''))) NOT BETWEEN 12 AND 200 THEN
   RAISE EXCEPTION 'Invalid bounded sandbox operator approval';
 END IF;
 INSERT INTO public.ai_workforce_sandbox_pilots
  (tenant_id,product_key,enabled,expires_at,daily_limit,allowed_fixtures,operator_reference)
 VALUES(_tenant,_product,_enabled,_expires_at,_daily_limit,_allowed_fixtures,btrim(_operator_reference))
 ON CONFLICT(tenant_id,product_key) DO UPDATE SET
 enabled=EXCLUDED.enabled,expires_at=EXCLUDED.expires_at,daily_limit=EXCLUDED.daily_limit,
 allowed_fixtures=EXCLUDED.allowed_fixtures,operator_reference=EXCLUDED.operator_reference,updated_at=now()
 RETURNING * INTO saved;
 RETURN saved;
END $pilot$;

-- Atomic admission into existing intelligence_jobs (NOT an agent/model run).
-- Lock the pilot to serialize per-tenant quotas; server owns all inputs.
CREATE FUNCTION public.queue_ai_workforce_fixture_rehearsal(
 _tenant uuid,_product text,_employee uuid,_task uuid,_fixture text,_idempotency uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $queue$
DECLARE
 pilot public.ai_workforce_sandbox_pilots;
 e public.ai_employees; t public.ai_employee_tasks; uc public.ai_use_cases;
 existing public.ai_workforce_sandbox_admissions;
 job uuid; admission uuid; request_signature text; num_today integer;
BEGIN
 PERFORM public.ai_workforce_require_admin(_tenant,_product);
 SELECT * INTO STRICT pilot FROM public.ai_workforce_sandbox_pilots
 WHERE tenant_id=_tenant AND product_key=_product FOR UPDATE;
 IF NOT pilot.enabled OR pilot.expires_at<=now() THEN
  RAISE EXCEPTION 'No active, time-limited sandbox pilot';
 END IF;
 IF _fixture IS NULL OR NOT (_fixture=ANY(pilot.allowed_fixtures)) OR _idempotency IS NULL THEN
  RAISE EXCEPTION 'Unapproved synthetic fixture or idempotency key';
 END IF;
 SELECT * INTO STRICT e FROM public.ai_employees
 WHERE id=_employee AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 SELECT * INTO STRICT t FROM public.ai_employee_tasks
 WHERE id=_task AND employee_id=_employee AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 IF e.status<>'approved_configuration' OR e.reviewed_by IS NULL OR
    e.reviewed_by IN(e.created_by,e.last_edited_by) OR
    t.status<>'approved_brief' OR t.reviewed_by IS NULL OR
    t.reviewed_by IN(t.created_by,t.last_edited_by) OR
    t.employee_revision<>e.revision OR
    t.proposed_trigger->>'enabled' IS DISTINCT FROM 'false' OR
    cardinality(t.requested_capabilities)<>0 THEN
  RAISE EXCEPTION 'Independent approved no-tool employee brief required';
 END IF;
 SELECT * INTO uc FROM public.ai_use_cases
 WHERE tenant_id=_tenant AND product_key=_product AND use_case_key=e.blueprint_key;
 IF uc.id IS NULL OR uc.status NOT IN('approved','pilot') OR uc.approved_by IS NULL OR
    uc.owner_user_id IS NOT DISTINCT FROM uc.approved_by THEN
  RAISE EXCEPTION 'Independent approved Agent Factory use case required';
 END IF;
 request_signature:=md5(concat_ws(':',_tenant::text,_product,_employee::text,_task::text,
     e.revision::text,t.revision::text,_fixture));
 SELECT * INTO existing FROM public.ai_workforce_sandbox_admissions
  WHERE tenant_id=_tenant AND product_key=_product AND idempotency_key=_idempotency;
 IF existing.id IS NOT NULL THEN
   IF existing.request_hash<>request_signature THEN
      RAISE EXCEPTION 'Sandbox idempotency payload changed';
   END IF;
   RETURN jsonb_build_object('admissionId',existing.id,'jobId',existing.job_id,
      'status',existing.status,'alreadyExists',true,'fixtureKey',existing.fixture_key,
      'syntheticOnly',true,'modelCalls',0);
 END IF;
 SELECT count(*) INTO num_today FROM public.ai_workforce_sandbox_admissions a
 WHERE a.tenant_id=_tenant AND a.product_key=_product AND
  a.admitted_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
 IF num_today>=pilot.daily_limit THEN
  RAISE EXCEPTION 'Sandbox daily quota exceeded';
 END IF;
 INSERT INTO public.intelligence_jobs
  (tenant_id,product_key,job_type,subject_type,subject_id,priority,status,input,requirements)
 VALUES(_tenant,_product,'ai-workforce.fixture','ai_employee_task',t.id::text,'low','queued',
  jsonb_build_object('fixtureKey',_fixture,'employeeId',e.id,'taskId',t.id,
    'employeeRevision',e.revision,'taskRevision',t.revision),
  jsonb_build_object('syntheticOnly',true,'noModel',true,'noExternalCalls',true,
    'noTools',true,'readOnly',true,'requireHumanReview',true,'maximumAttempts',1))
 RETURNING id INTO job;
 INSERT INTO public.ai_workforce_sandbox_admissions
 (tenant_id,product_key,employee_id,task_id,job_id,employee_revision,task_revision,
  fixture_key,idempotency_key,request_hash,admitted_by)
 VALUES(_tenant,_product,e.id,t.id,job,e.revision,t.revision,
  _fixture,_idempotency,request_signature,auth.uid())
 RETURNING id INTO admission;
 RETURN jsonb_build_object('admissionId',admission,'jobId',job,
   'status','queued','alreadyExists',false,'fixtureKey',_fixture,
   'syntheticOnly',true,'modelCalls',0);
END $queue$;

-- Generic intelligence workers must not claim sandbox work, even when
-- the normal caller passes NULL (all job types) or explicitly asks for the type.
-- Keep old contract fully intact for all other job types.
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
    AND j.job_type <> 'ai-workforce.fixture'
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

-- Separate service-role-only claimant can access a narrow fixture-only claim.
-- It never returns business-context text, raw customer data, or tool credentials.
CREATE FUNCTION public.claim_ai_workforce_fixture_rehearsals(
 _tenant uuid,_product text,_worker_ref text,_limit integer DEFAULT 2)
RETURNS SETOF jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $claim$
DECLARE candidate record;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR
    _worker_ref IS NULL OR _worker_ref !~ '^[A-Za-z0-9_-]{8,80}$' OR
    _limit IS NULL OR _limit NOT BETWEEN 1 AND 5 THEN
   RAISE EXCEPTION 'Certified sandbox service credential required';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.ai_workforce_sandbox_pilots p
  WHERE p.tenant_id=_tenant AND p.product_key=_product
    AND p.enabled AND p.expires_at>now()) THEN
  RAISE EXCEPTION 'Sandbox pilot is disabled or expired';
 END IF;
 FOR candidate IN
  SELECT a.id AS admission_id,a.job_id,a.employee_id,a.task_id,
    a.employee_revision,a.task_revision,a.fixture_key,
    j.id AS canonical_id
  FROM public.ai_workforce_sandbox_admissions a
  JOIN public.intelligence_jobs j ON j.id=a.job_id AND j.tenant_id=a.tenant_id
    AND j.product_key=a.product_key AND j.job_type='ai-workforce.fixture'
  JOIN public.ai_employees e ON e.id=a.employee_id AND e.tenant_id=a.tenant_id
    AND e.product_key=a.product_key
  JOIN public.ai_employee_tasks t ON t.id=a.task_id AND t.employee_id=a.employee_id
    AND t.tenant_id=a.tenant_id AND t.product_key=a.product_key
  WHERE a.tenant_id=_tenant AND a.product_key=_product
    AND a.status='queued' AND j.status='queued'
    AND j.attempts=0 AND j.next_attempt_at<=now()
    AND a.admitted_at>=now()-interval '30 minutes'
    AND e.status='approved_configuration'
    AND t.status='approved_brief'
    AND e.revision=a.employee_revision AND t.revision=a.task_revision
    AND t.employee_revision=e.revision
    AND cardinality(t.requested_capabilities)=0
  ORDER BY a.admitted_at
  LIMIT _limit
  FOR UPDATE OF a,j SKIP LOCKED
 LOOP
  UPDATE public.ai_workforce_sandbox_admissions
    SET status='processing',worker_ref=_worker_ref WHERE id=candidate.admission_id;
  UPDATE public.intelligence_jobs
    SET status='processing',attempts=1,worker_key_id=_worker_ref,
      locked_at=now(),started_at=now(),updated_at=now()
  WHERE id=candidate.job_id;
  RETURN NEXT jsonb_build_object(
    'admissionId',candidate.admission_id,'jobId',candidate.job_id,
    'tenantId',_tenant,'productKey',_product,'employeeId',candidate.employee_id,
    'taskId',candidate.task_id,'fixtureKey',candidate.fixture_key,
    'employeeRevision',candidate.employee_revision,
    'taskRevision',candidate.task_revision,
    'syntheticOnly',true,'maxSteps',1);
 END LOOP;
END $claim$;

CREATE FUNCTION public.finish_ai_workforce_fixture_rehearsal(
 _tenant uuid,_product text,_admission uuid,_worker_ref text,
 _success boolean,_result jsonb DEFAULT '{}'::jsonb,_error text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $finish$
DECLARE a public.ai_workforce_sandbox_admissions;
 j public.intelligence_jobs; e public.ai_employees;t public.ai_employee_tasks;
 pilot public.ai_workforce_sandbox_pilots; fingerprint text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
   RAISE EXCEPTION 'Certified sandbox service credential required';
 END IF;
 IF _worker_ref IS NULL OR _worker_ref !~ '^[A-Za-z0-9_-]{8,80}$' THEN
   RAISE EXCEPTION 'Invalid sandbox worker reference';
 END IF;
 SELECT * INTO STRICT a FROM public.ai_workforce_sandbox_admissions
  WHERE id=_admission AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 SELECT * INTO STRICT j FROM public.intelligence_jobs
  WHERE id=a.job_id AND tenant_id=_tenant AND product_key=_product
   AND job_type='ai-workforce.fixture' FOR UPDATE;
 IF a.status<>'processing' OR j.status<>'processing' OR
    a.worker_ref IS DISTINCT FROM _worker_ref OR
    j.worker_key_id IS DISTINCT FROM _worker_ref THEN
  RAISE EXCEPTION 'Sandbox worker lease or status mismatch';
 END IF;
 IF _success IS NULL THEN RAISE EXCEPTION 'Sandbox outcome required'; END IF;
 IF _success THEN
  SELECT * INTO STRICT e FROM public.ai_employees
   WHERE id=a.employee_id AND tenant_id=_tenant AND product_key=_product;
  SELECT * INTO STRICT t FROM public.ai_employee_tasks
   WHERE id=a.task_id AND employee_id=a.employee_id AND tenant_id=_tenant AND product_key=_product;
  SELECT * INTO pilot FROM public.ai_workforce_sandbox_pilots
   WHERE tenant_id=_tenant AND product_key=_product;
  IF pilot.enabled IS DISTINCT FROM true OR pilot.expires_at<=now() OR
     e.status<>'approved_configuration' OR e.revision<>a.employee_revision OR
     t.status<>'approved_brief' OR t.revision<>a.task_revision OR
     t.employee_revision<>e.revision THEN
   RAISE EXCEPTION 'Pilot disabled or employee/task revision revoked mid-flight';
  END IF;
  IF _result IS NULL OR jsonb_typeof(_result)<>'object' OR
     length(_result::text)>8000 OR
     _result->>'fixtureKey' IS DISTINCT FROM a.fixture_key OR
     _result->>'dataOrigin' IS DISTINCT FROM 'synthetic_fixture' OR
     _result->>'reviewRequired' IS DISTINCT FROM 'true' OR
     _result->>'modelCalls' IS DISTINCT FROM '0' OR
     _result->>'toolCalls' IS DISTINCT FROM '0' OR
     _result->>'costMinor' IS DISTINCT FROM '0' OR
     jsonb_typeof(_result->'findings') IS DISTINCT FROM 'array' OR
     jsonb_typeof(_result->'citations') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Untrusted or executable sandbox receipt refused';
  END IF;
  fingerprint:=md5(_result::text);
 END IF;
 UPDATE public.intelligence_jobs SET
  status=CASE WHEN _success THEN 'completed' ELSE 'failed' END,
  result=CASE WHEN _success THEN _result ELSE '{}'::jsonb END,
  last_error=CASE WHEN _success THEN NULL ELSE left(COALESCE(_error,'sandbox execution failed'),300) END,
  completed_at=now(),updated_at=now(),locked_at=NULL
 WHERE id=j.id;
 UPDATE public.ai_workforce_sandbox_admissions SET
  status=CASE WHEN _success THEN 'completed' ELSE 'failed' END,
  receipt_fingerprint=fingerprint,finished_at=now()
 WHERE id=a.id;
 RETURN jsonb_build_object('admissionId',a.id,'jobId',j.id,
  'status',CASE WHEN _success THEN 'completed' ELSE 'failed' END,
  'syntheticOnly',true,'costMinor',0);
END $finish$;

CREATE FUNCTION public.cancel_ai_workforce_fixture_rehearsal(
 _tenant uuid,_product text,_admission uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $cancel$
DECLARE a public.ai_workforce_sandbox_admissions; j public.intelligence_jobs;
BEGIN
 PERFORM public.ai_workforce_require_admin(_tenant,_product);
 SELECT * INTO STRICT a FROM public.ai_workforce_sandbox_admissions
  WHERE id=_admission AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 SELECT * INTO STRICT j FROM public.intelligence_jobs
  WHERE id=a.job_id AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 IF a.status<>'queued' OR j.status<>'queued' THEN
  RAISE EXCEPTION 'Only unclaimed sandbox rehearsals can be cancelled';
 END IF;
 UPDATE public.ai_workforce_sandbox_admissions SET status='cancelled',finished_at=now()
 WHERE id=a.id;
 UPDATE public.intelligence_jobs SET status='cancelled',completed_at=now(),updated_at=now()
 WHERE id=j.id;
 RETURN jsonb_build_object('admissionId',a.id,'status','cancelled');
END $cancel$;

REVOKE ALL ON FUNCTION public.configure_ai_workforce_sandbox_pilot(uuid,text,boolean,timestamptz,integer,text[],text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.configure_ai_workforce_sandbox_pilot(uuid,text,boolean,timestamptz,integer,text[],text) TO service_role;
REVOKE ALL ON FUNCTION public.queue_ai_workforce_fixture_rehearsal(uuid,text,uuid,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.queue_ai_workforce_fixture_rehearsal(uuid,text,uuid,uuid,text,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.claim_ai_workforce_fixture_rehearsals(uuid,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_workforce_fixture_rehearsals(uuid,text,text,integer) TO service_role;
REVOKE ALL ON FUNCTION public.finish_ai_workforce_fixture_rehearsal(uuid,text,uuid,text,boolean,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_ai_workforce_fixture_rehearsal(uuid,text,uuid,text,boolean,jsonb,text) TO service_role;
REVOKE ALL ON FUNCTION public.cancel_ai_workforce_fixture_rehearsal(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_ai_workforce_fixture_rehearsal(uuid,text,uuid) TO authenticated;

COMMIT;
