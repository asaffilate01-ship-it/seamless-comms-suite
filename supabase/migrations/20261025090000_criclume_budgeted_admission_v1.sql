-- CricLume: service-credential-bound, budgeted, ADVISORY-ONLY AI admission.
-- No tenant, pilot, credential, model binding, worker or customer is activated.
-- The existing Lovable Supabase database remains authoritative for cricket.
BEGIN;

CREATE TABLE public.criclume_ai_pilot_controls (
 tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL DEFAULT 'criclume' CHECK(product_key='criclume'),
 currency text NOT NULL CHECK(currency IN('GBP','EUR','USD')),
 enabled boolean NOT NULL DEFAULT false,
 worker_ready boolean NOT NULL DEFAULT false,
 expires_at timestamptz NOT NULL,
 daily_limit integer NOT NULL CHECK(daily_limit BETWEEN 1 AND 20),
 max_run_minor bigint NOT NULL CHECK(max_run_minor BETWEEN 1 AND 10000),
 requested_by uuid NOT NULL REFERENCES auth.users(id),
 approved_by uuid REFERENCES auth.users(id),
 approved_at timestamptz,
 worker_reviewed_by uuid REFERENCES auth.users(id),
 worker_reviewed_at timestamptz,
 review_note text NOT NULL CHECK(length(btrim(review_note)) BETWEEN 16 AND 1200),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT criclume_pilot_review CHECK (
  NOT enabled OR (approved_by IS NOT NULL AND approved_at IS NOT NULL
   AND requested_by<>approved_by)),
 CONSTRAINT criclume_pilot_worker CHECK (
  NOT worker_ready OR (enabled AND worker_reviewed_by IS NOT NULL
   AND worker_reviewed_at IS NOT NULL AND worker_reviewed_by<>requested_by)),
 FOREIGN KEY(tenant_id,product_key)
  REFERENCES public.tenant_products(tenant_id,product_key) ON DELETE CASCADE
);

CREATE TABLE public.criclume_ai_source_bindings (
 tenant_id uuid NOT NULL,
 product_key text NOT NULL DEFAULT 'criclume' CHECK(product_key='criclume'),
 source_organisation_id uuid NOT NULL,
 credential_id uuid NOT NULL,
 enabled boolean NOT NULL DEFAULT false,
 expires_at timestamptz NOT NULL,
 requested_by uuid NOT NULL REFERENCES auth.users(id),
 approved_by uuid REFERENCES auth.users(id),
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,source_organisation_id),
 UNIQUE(tenant_id,credential_id,source_organisation_id),
 CONSTRAINT criclume_binding_review CHECK (
  NOT enabled OR (approved_by IS NOT NULL AND approved_at IS NOT NULL
   AND requested_by<>approved_by)),
 FOREIGN KEY(tenant_id,product_key)
  REFERENCES public.tenant_products(tenant_id,product_key) ON DELETE CASCADE,
 FOREIGN KEY(credential_id)
  REFERENCES public.platform_service_credentials(id) ON DELETE RESTRICT
);

CREATE TABLE public.criclume_ai_budgeted_admissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 product_key text NOT NULL DEFAULT 'criclume' CHECK(product_key='criclume'),
 source_organisation_id uuid NOT NULL,
 source_match_id uuid NOT NULL,
 source_revision timestamptz NOT NULL,
 task text NOT NULL CHECK(task IN(
  'match_insights','batting_coach','bowling_coach','fielding_review',
  'training_plan','analyst_agent'
 )),
 source_snapshot jsonb NOT NULL CHECK(jsonb_typeof(source_snapshot)='object'),
 snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^[0-9a-f]{32}$'),
 request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{32}$'),
 idempotency_key uuid NOT NULL,
 service_credential_id uuid NOT NULL,
 use_case_id uuid NOT NULL REFERENCES public.ai_use_cases(id) ON DELETE RESTRICT,
 run_id uuid NOT NULL UNIQUE REFERENCES public.ai_agent_runs(id) ON DELETE RESTRICT,
 job_id uuid NOT NULL UNIQUE REFERENCES public.intelligence_jobs(id) ON DELETE RESTRICT,
 reservation_id uuid NOT NULL UNIQUE REFERENCES public.ai_budgeted_run_reservations(id) ON DELETE RESTRICT,
 provider_key text NOT NULL,
 model_key text NOT NULL,
 rate_version text NOT NULL,
 currency text NOT NULL CHECK(currency IN('GBP','EUR','USD')),
 reserved_minor bigint NOT NULL CHECK(reserved_minor>0),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN(
  'queued','processing','waiting_review','completed','failed','cancelled','stale'
 )),
 admitted_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,product_key)
  REFERENCES public.tenant_products(tenant_id,product_key) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,source_organisation_id)
  REFERENCES public.criclume_ai_source_bindings(tenant_id,source_organisation_id) ON DELETE RESTRICT,
 UNIQUE(tenant_id,idempotency_key),
 UNIQUE(tenant_id,source_organisation_id,source_match_id,task,source_revision)
);
CREATE INDEX criclume_ai_admissions_recent_idx
 ON public.criclume_ai_budgeted_admissions(tenant_id,admitted_at DESC);

DO $secure$ DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY[
  'criclume_ai_pilot_controls','criclume_ai_source_bindings','criclume_ai_budgeted_admissions'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
END $secure$;

-- SECURITY DEFINER must never turn a browser into a model spender.
-- Only a server-authenticated, product/tenant-scoped service can call this RPC.
CREATE FUNCTION public.queue_criclume_budgeted_agent(
 _tenant uuid, _source_org uuid, _source_match uuid, _source_revision timestamptz,
 _task text, _source_snapshot jsonb, _idempotency uuid, _service_credential uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $admit$
DECLARE
 pilot public.criclume_ai_pilot_controls;
 binding public.criclume_ai_source_bindings;
 cred public.platform_service_credentials;
 uc public.ai_use_cases;
 budget public.ai_spend_budgets;
 old public.criclume_ai_budgeted_admissions;
 chosen record;
 country text;
 blueprint text; goal text;
 input_cap integer; output_cap integer; step_cap integer;
 month_start date; day_start timestamptz; day_count bigint;
 fingerprint text; snapshot_hash text;
 run_uuid uuid; job_uuid uuid; reservation_uuid uuid; admission_uuid uuid;
 BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'CricLume budgeted admission requires service-role authentication';
 END IF;
 IF _tenant IS NULL OR _source_org IS NULL OR _source_match IS NULL
  OR _source_revision IS NULL OR _idempotency IS NULL OR _service_credential IS NULL
  OR _source_revision > now()+interval '5 minutes'
  OR _task NOT IN (
   'match_insights','batting_coach','bowling_coach','fielding_review',
   'training_plan','analyst_agent'
  ) THEN
  RAISE EXCEPTION 'Invalid CricLume budgeted admission scope';
 END IF;
 SELECT * INTO pilot FROM public.criclume_ai_pilot_controls
  WHERE tenant_id=_tenant AND product_key='criclume' FOR UPDATE;
 IF NOT FOUND OR pilot.enabled IS DISTINCT FROM true OR
   pilot.worker_ready IS DISTINCT FROM true OR pilot.expires_at<=now()
   OR pilot.approved_at IS NULL OR pilot.worker_reviewed_at IS NULL
   OR pilot.requested_by IN(pilot.approved_by,pilot.worker_reviewed_by) THEN
  RAISE EXCEPTION 'CricLume budgeted worker and independent pilot approval required';
 END IF;
 SELECT * INTO binding FROM public.criclume_ai_source_bindings
  WHERE tenant_id=_tenant AND source_organisation_id=_source_org FOR SHARE;
 IF NOT FOUND OR binding.enabled IS DISTINCT FROM true OR
   binding.expires_at<=now() OR binding.credential_id<>_service_credential
   OR binding.approved_at IS NULL OR binding.requested_by=binding.approved_by THEN
  RAISE EXCEPTION 'Approved CricLume source binding required';
 END IF;
 SELECT * INTO cred FROM public.platform_service_credentials
  WHERE id=_service_credential;
 IF NOT FOUND OR cred.status<>'active' OR
   (cred.expires_at IS NOT NULL AND cred.expires_at<=now()) OR
   NOT EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(cred.scopes::jsonb) x(scope_data)
    WHERE x.scope_data->>'tenantId'=_tenant::text
      AND x.scope_data->>'productKey'='criclume'
      AND x.scope_data->'capabilities' ? 'intelligence.run.budgeted'
      AND (x.scope_data->'brandIds' IS NULL OR
           pg_catalog.jsonb_array_length(x.scope_data->'brandIds')=0)
      AND (x.scope_data->'locationIds' IS NULL OR
           pg_catalog.jsonb_array_length(x.scope_data->'locationIds')=0)
   ) THEN
  RAISE EXCEPTION 'CricLume service credential and explicit budgeted scope required';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.tenant_products p WHERE p.tenant_id=_tenant
   AND p.product_key='criclume' AND p.status='active'
 ) OR NOT public.has_tenant_entitlement(_tenant,'omniqora.intelligence-runtime') THEN
  RAISE EXCEPTION 'Active CricLume product and intelligence entitlement required';
 END IF;
 IF _source_snapshot IS NULL OR pg_catalog.jsonb_typeof(_source_snapshot)<>'object'
   OR _source_snapshot->>'evidencePolicy' IS DISTINCT FROM
      'aggregates_only;no_children_or_biometrics;human_review_required'
   OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_object_keys(_source_snapshot) x(field)
    WHERE x.field NOT IN (
     'runs','wickets','overs','target','recent','matchStatus','evidencePolicy'
    )
   )
   OR pg_catalog.jsonb_typeof(_source_snapshot->'recent') IS DISTINCT FROM 'array'
   OR pg_catalog.jsonb_array_length(_source_snapshot->'recent')>6
   OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements_text(_source_snapshot->'recent') x(ball)
    WHERE x.ball NOT IN ('0','1','2','3','4','5','6','W','Wd','Nb','·','?')
   )
   OR pg_catalog.jsonb_typeof(_source_snapshot->'matchStatus') IS DISTINCT FROM 'string'
   OR _source_snapshot->>'matchStatus' NOT IN (
     'live','completed','innings_break','draft','scheduled','unknown'
   )
   OR (
    _source_snapshot->'overs' IS NOT NULL
    AND pg_catalog.jsonb_typeof(_source_snapshot->'overs') NOT IN ('null','string')
   ) OR (
    pg_catalog.jsonb_typeof(_source_snapshot->'overs')='string'
    AND (_source_snapshot->>'overs') !~ '^[0-9]{1,3}\.[0-5]$'
   )
   OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_each(_source_snapshot) f(key,value)
    WHERE f.key IN('runs','wickets','target')
      AND NOT (
       pg_catalog.jsonb_typeof(f.value)='null'
       OR (
        pg_catalog.jsonb_typeof(f.value)='number'
        AND f.value::text ~ '^[0-9]{1,4}$'
        AND f.value::text::integer <= CASE f.key
         WHEN 'wickets' THEN 10 WHEN 'runs' THEN 2000 ELSE 3000 END
       )
      )
   )
 THEN
  RAISE EXCEPTION 'CricLume aggregate data classification boundary refused';
 END IF;
 -- A service carries an exact, authorised source scope, never identity/biometrics.
 snapshot_hash:=md5(_source_snapshot::text);
 fingerprint:=md5(concat_ws('|',_tenant::text,_source_org::text,
  _source_match::text,_source_revision::text,_task,snapshot_hash));
 SELECT * INTO old FROM public.criclume_ai_budgeted_admissions
  WHERE tenant_id=_tenant AND idempotency_key=_idempotency;
 IF FOUND THEN
  IF old.request_hash<>fingerprint THEN
   RAISE EXCEPTION 'CricLume idempotency payload changed';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
   'admissionId',old.id,'runId',old.run_id,'jobId',old.job_id,
   'reservationId',old.reservation_id,'reservedMinor',old.reserved_minor,
   'currency',old.currency,'status',old.status,'alreadyExists',true,
   'humanReviewRequired',true);
 END IF;
 blueprint:=CASE _task
  WHEN 'match_insights' THEN 'criclume.match-insights'
  WHEN 'batting_coach' THEN 'criclume.batting-coach'
  WHEN 'bowling_coach' THEN 'criclume.bowling-coach'
  WHEN 'fielding_review' THEN 'criclume.fielding-review'
  WHEN 'training_plan' THEN 'criclume.training-plan'
  WHEN 'analyst_agent' THEN 'criclume.match-analyst'
 END;
 SELECT * INTO uc FROM public.ai_use_cases
  WHERE tenant_id=_tenant AND product_key='criclume'
    AND use_case_key=blueprint FOR SHARE;
 IF NOT FOUND OR uc.status NOT IN('approved','pilot')
   OR uc.approved_by IS NULL OR uc.owner_user_id=uc.approved_by
   OR uc.provider_route->>'factoryBlueprint' IS DISTINCT FROM blueprint
   OR pg_catalog.cardinality(uc.allowed_tools)<>1
   OR NOT ('criclume.matches.aggregate.read'=ANY(uc.allowed_tools)) THEN
  RAISE EXCEPTION 'Independently approved aggregate-only cricket agent required';
 END IF;
 SELECT country_code INTO country FROM public.tenants WHERE id=_tenant;
 IF country IS NULL THEN RAISE EXCEPTION 'Tenant country not verified'; END IF;
 -- Fixed token ceilings are internal admission policy, not browser-controlled.
 input_cap:=CASE WHEN _task='analyst_agent' THEN 1800 ELSE 1200 END;
 output_cap:=CASE WHEN _task='analyst_agent' THEN 800 ELSE 500 END;
 step_cap:=CASE WHEN _task='analyst_agent' THEN 5 ELSE 3 END;
 goal:=CASE _task
  WHEN 'match_insights' THEN 'Prepare a sourced, human-reviewed aggregate cricket match summary'
  WHEN 'batting_coach' THEN 'Draft aggregate-only batting coaching discussion prompts'
  WHEN 'bowling_coach' THEN 'Draft aggregate-only bowling control and extras coaching prompts'
  WHEN 'fielding_review' THEN 'Draft fielding practice prompts without identifying players'
  WHEN 'training_plan' THEN 'Draft a reviewed team training plan from aggregate cricket statistics'
  WHEN 'analyst_agent' THEN 'Prepare a bounded cricket analyst report from aggregate match evidence'
 END;
 day_start:=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
 SELECT count(*) INTO day_count FROM public.criclume_ai_budgeted_admissions
  WHERE tenant_id=_tenant AND admitted_at>=day_start;
 IF day_count>=pilot.daily_limit THEN
  RAISE EXCEPTION 'CricLume AI pilot daily cost quota exceeded';
 END IF;
 month_start:=date_trunc('month',now() AT TIME ZONE 'UTC')::date;
 SELECT * INTO budget FROM public.ai_spend_budgets
  WHERE tenant_id=_tenant AND product_key='criclume'
    AND currency=pilot.currency AND period_month=month_start FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Approved monthly CricLume AI budget required'; END IF;
 -- Select latest verified price PER model, then cheapest approved capable model
 -- in the single tenant-approved currency. Never use made-up or stale tariffs.
 SELECT best.provider_key,best.model_key,best.rate_version,best.cost_minor INTO chosen
 FROM (
  SELECT DISTINCT ON (r.provider_key,r.model_key)
   r.provider_key,r.model_key,r.rate_version,r.verified_at,
   (pg_catalog.ceil(input_cap::numeric*r.input_minor_per_million/1000000)
    +pg_catalog.ceil(output_cap::numeric*r.output_minor_per_million/1000000))::bigint AS cost_minor
  FROM public.ai_reviewed_model_rates r
  JOIN public.provider_bindings b
   ON b.tenant_id=_tenant AND b.product_key='criclume'
   AND b.provider_key=r.provider_key AND b.environment='production'
   AND b.status='active' AND b.last_verified_at>=now()-interval '24 hours'
  JOIN public.ai_model_catalogue mc
   ON mc.provider_key=r.provider_key AND mc.model_key=r.model_key
   AND mc.status='active' AND 'text'=ANY(mc.capabilities)
  WHERE r.currency=pilot.currency AND r.status='approved'
   AND r.evaluation_passed AND r.verified_at BETWEEN now()-interval '30 days' AND now()
   AND pg_catalog.cardinality(r.supported_regions)>0
   AND country=ANY(r.supported_regions)
   AND r.minimum_risk_grade IN('sensitive','regulated')
   AND (CASE r.minimum_risk_grade WHEN 'regulated' THEN 3
       WHEN 'sensitive' THEN 2 ELSE 1 END)
       >=(CASE uc.risk_level WHEN 'high' THEN 3
           WHEN 'review' THEN 2 ELSE 1 END)
  ORDER BY r.provider_key,r.model_key,r.verified_at DESC,r.rate_version DESC
 ) best
 ORDER BY best.cost_minor,best.provider_key,best.model_key LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'No current evaluated regional cricket AI model'; END IF;
 IF chosen.cost_minor<=0 OR chosen.cost_minor>pilot.max_run_minor THEN
  RAISE EXCEPTION 'No approved and affordable cricket AI model';
 END IF;
 IF budget.reserved_minor+budget.spent_minor+chosen.cost_minor>budget.limit_minor THEN
  RAISE EXCEPTION 'CricLume AI monthly budget exhausted';
 END IF;
 IF uc.monthly_budget_minor IS NOT NULL AND
  (SELECT COALESCE(sum(CASE WHEN status='reserved' THEN reserved_minor
                        ELSE COALESCE(actual_minor,0) END),0)
   FROM public.ai_budgeted_run_reservations
   WHERE tenant_id=_tenant AND product_key='criclume'
    AND use_case_id=uc.id AND period_month=month_start AND status<>'released'
  )+chosen.cost_minor>uc.monthly_budget_minor THEN
  RAISE EXCEPTION 'Cricket agent use-case budget exhausted';
 END IF;
 UPDATE public.ai_spend_budgets
  SET reserved_minor=reserved_minor+chosen.cost_minor,updated_at=now()
  WHERE tenant_id=_tenant AND product_key='criclume'
   AND period_month=month_start AND currency=pilot.currency;
 INSERT INTO public.ai_agent_runs(
  tenant_id,product_key,use_case_id,profile,goal,status,
  max_steps,provider_key,model,input_version,initiated_by
 ) VALUES(_tenant,'criclume',uc.id,'operations',goal,'queued',
  step_cap,chosen.provider_key,chosen.model_key,'criclume-budget-v1',NULL)
 RETURNING id INTO run_uuid;
 INSERT INTO public.ai_budgeted_run_reservations(
  tenant_id,product_key,run_id,use_case_id,period_month,currency,
  reserved_minor,provider_key,model_key,rate_version,idempotency_key,request_hash
 ) VALUES(_tenant,'criclume',run_uuid,uc.id,month_start,pilot.currency,
  chosen.cost_minor,chosen.provider_key,chosen.model_key,chosen.rate_version,
  _idempotency,fingerprint) RETURNING id INTO reservation_uuid;
 -- Never submit this reserved job to a generic AI runner (no receipt guarantees).
 INSERT INTO public.intelligence_jobs(
  tenant_id,product_key,job_type,subject_type,subject_id,priority,status,input,requirements
 ) VALUES(_tenant,'criclume','criclume.budgeted.readonly','ai_agent_run',run_uuid::text,
  'normal','queued',
  pg_catalog.jsonb_build_object(
   'runId',run_uuid,'sourceProduct','criclume','sourceOrganisationId',_source_org,
   'sourceMatchId',_source_match,'sourceRevision',_source_revision,
   'sourceSnapshot',_source_snapshot,'sourceSnapshotHash',snapshot_hash,
   'task',_task,'providerKey',chosen.provider_key,'model',chosen.model_key,
   'maxInputTokens',input_cap,'maxOutputTokens',output_cap,'maxSteps',step_cap),
  pg_catalog.jsonb_build_object(
   'budgetReservationId',reservation_uuid,'rateVersion',chosen.rate_version,
   'reservedMinor',chosen.cost_minor,'currency',pilot.currency,
   'readOnly',true,'noTools',true,'humanReviewRequired',true,
   'allowUnverifiedMcp',false,'noExternalActions',true,'sourcePermissionsRequired',true,
   'maxInputTokens',input_cap,'maxOutputTokens',output_cap,'maxSteps',step_cap)
 ) RETURNING id INTO job_uuid;
 INSERT INTO public.criclume_ai_budgeted_admissions(
  tenant_id,product_key,source_organisation_id,source_match_id,source_revision,
  task,source_snapshot,snapshot_hash,request_hash,idempotency_key,
  service_credential_id,use_case_id,run_id,job_id,reservation_id,
  provider_key,model_key,rate_version,currency,reserved_minor
 ) VALUES(_tenant,'criclume',_source_org,_source_match,_source_revision,
  _task,_source_snapshot,snapshot_hash,fingerprint,_idempotency,
  _service_credential,uc.id,run_uuid,job_uuid,reservation_uuid,
  chosen.provider_key,chosen.model_key,chosen.rate_version,pilot.currency,chosen.cost_minor)
 RETURNING id INTO admission_uuid;
 RETURN pg_catalog.jsonb_build_object(
  'admissionId',admission_uuid,'runId',run_uuid,'jobId',job_uuid,
  'reservationId',reservation_uuid,'status','queued','alreadyExists',false,
  'reservedMinor',chosen.cost_minor,'currency',pilot.currency,
  'humanReviewRequired',true);
 END;
$admit$;

REVOKE ALL ON FUNCTION public.queue_criclume_budgeted_agent(
 uuid,uuid,uuid,timestamptz,text,jsonb,uuid,uuid
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_criclume_budgeted_agent(
 uuid,uuid,uuid,timestamptz,text,jsonb,uuid,uuid
) TO service_role;

-- Hard-interlock: no existing generic job worker may consume a budgeted
-- CricLume job before the dedicated worker and receipt settlement are certified.
CREATE OR REPLACE FUNCTION public.claim_intelligence_jobs_for_scope(
 _tenant uuid,_product text,_limit integer DEFAULT 10,
 _job_types text[] DEFAULT NULL,_worker_key text DEFAULT NULL
) RETURNS SETOF jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $generic_claim$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'Service-role claim authorization required';
 END IF;
 RETURN QUERY
 WITH jobs AS(
  SELECT j.id FROM public.intelligence_jobs j
  WHERE j.tenant_id=_tenant AND j.product_key=_product
    AND ((j.status='queued' AND j.next_attempt_at<=now())
      OR (j.status='processing' AND j.locked_at<now()-interval '10 minutes'))
    AND j.job_type NOT IN(
      'ai-workforce.fixture','ai-workforce.readonly','criclume.budgeted.readonly'
    )
    AND (_job_types IS NULL OR j.job_type=ANY(_job_types))
  ORDER BY CASE j.priority WHEN 'urgent' THEN 0
   WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,j.created_at
  LIMIT LEAST(GREATEST(_limit,1),50) FOR UPDATE SKIP LOCKED
 )
 UPDATE public.intelligence_jobs j
 SET status='processing',attempts=j.attempts+1,locked_at=now(),
  started_at=COALESCE(j.started_at,now()),worker_key_id=_worker_key,updated_at=now()
 FROM jobs x WHERE j.id=x.id
 RETURNING pg_catalog.jsonb_build_object('id',j.id,'tenantId',j.tenant_id,
  'productKey',j.product_key,'jobType',j.job_type,'subjectType',j.subject_type,
  'subjectId',j.subject_id,'priority',j.priority,'input',j.input,
  'requirements',j.requirements,'attempts',j.attempts);
END;
$generic_claim$;

REVOKE ALL ON FUNCTION public.claim_intelligence_jobs_for_scope(
 uuid,text,integer,text[],text
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_intelligence_jobs_for_scope(
 uuid,text,integer,text[],text
) TO service_role;

-- Safe cancellation from an independently scoped operator/service identity.
-- May cancel QUEUED work only; no processing/model charges may be erased.
CREATE FUNCTION public.cancel_criclume_budgeted_agent(
 _tenant uuid,_admission uuid,_service_credential uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $cancel$
DECLARE
 source_run public.criclume_ai_budgeted_admissions;
 res public.ai_budgeted_run_reservations;
 item public.ai_agent_runs;
 job public.intelligence_jobs;
 cred public.platform_service_credentials;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'Trusted service-role cancellation required';
 END IF;
 SELECT * INTO cred FROM public.platform_service_credentials
  WHERE id=_service_credential;
 IF NOT FOUND OR cred.status<>'active'
  OR (cred.expires_at IS NOT NULL AND cred.expires_at<=now())
  OR NOT EXISTS (
   SELECT 1 FROM pg_catalog.jsonb_array_elements(cred.scopes::jsonb) s(v)
   WHERE s.v->>'tenantId'=_tenant::text
    AND s.v->>'productKey'='criclume'
    AND s.v->'capabilities' ? 'intelligence.run.cancel'
    AND (s.v->'brandIds' IS NULL
     OR pg_catalog.jsonb_array_length(s.v->'brandIds')=0)
    AND (s.v->'locationIds' IS NULL
     OR pg_catalog.jsonb_array_length(s.v->'locationIds')=0)
  ) THEN
  RAISE EXCEPTION 'Explicit tenant-scoped cancel credential required';
 END IF;
 SELECT * INTO source_run FROM public.criclume_ai_budgeted_admissions
  WHERE id=_admission AND tenant_id=_tenant FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Scoped cricket admission not found'; END IF;
 SELECT * INTO res FROM public.ai_budgeted_run_reservations
  WHERE id=source_run.reservation_id AND tenant_id=_tenant
   AND product_key='criclume' FOR UPDATE;
 SELECT * INTO item FROM public.ai_agent_runs
  WHERE id=source_run.run_id AND tenant_id=_tenant
   AND product_key='criclume' FOR UPDATE;
 SELECT * INTO job FROM public.intelligence_jobs
  WHERE id=source_run.job_id AND tenant_id=_tenant
   AND product_key='criclume' AND job_type='criclume.budgeted.readonly' FOR UPDATE;
 IF res.id IS NULL OR item.id IS NULL OR job.id IS NULL THEN
  RAISE EXCEPTION 'AI run and reservation ledgers are inconsistent';
 END IF;
 IF source_run.status='cancelled' AND res.status='released'
  AND item.status='cancelled' AND job.status='cancelled' THEN
  RETURN pg_catalog.jsonb_build_object(
   'admissionId',source_run.id,'runId',item.id,
   'releasedMinor',0,'alreadyCancelled',true);
 END IF;
 IF source_run.status<>'queued' OR res.status<>'reserved'
  OR item.status<>'queued' OR job.status<>'queued' OR job.attempts<>0
  OR EXISTS(SELECT 1 FROM public.ai_agent_steps WHERE run_id=item.id) THEN
  RAISE EXCEPTION 'Model work began; cancellation requires verified worker usage settlement';
 END IF;
 PERFORM 1 FROM public.ai_spend_budgets
  WHERE tenant_id=_tenant AND product_key='criclume'
    AND period_month=res.period_month AND currency=res.currency FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Reserved monthly budget row missing'; END IF;
 UPDATE public.intelligence_jobs SET status='cancelled',updated_at=now(),
  completed_at=now() WHERE id=job.id;
 UPDATE public.ai_agent_runs SET status='cancelled',updated_at=now(),
  completed_at=now() WHERE id=item.id;
 UPDATE public.ai_budgeted_run_reservations
  SET status='released',actual_minor=0,settled_at=now() WHERE id=res.id;
 UPDATE public.criclume_ai_budgeted_admissions
  SET status='cancelled',updated_at=now() WHERE id=source_run.id;
 UPDATE public.ai_spend_budgets
  SET reserved_minor=reserved_minor-res.reserved_minor,updated_at=now()
  WHERE tenant_id=_tenant AND product_key='criclume'
    AND period_month=res.period_month AND currency=res.currency;
 RETURN pg_catalog.jsonb_build_object(
  'admissionId',source_run.id,'runId',item.id,
  'releasedMinor',res.reserved_minor,'alreadyCancelled',false);
END;
$cancel$;
REVOKE ALL ON FUNCTION public.cancel_criclume_budgeted_agent(uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_criclume_budgeted_agent(uuid,uuid,uuid)
 TO service_role;

COMMENT ON FUNCTION public.queue_criclume_budgeted_agent(
 uuid,uuid,uuid,timestamptz,text,jsonb,uuid,uuid
) IS 'CricLume service-role-only, explicit pilot-and-worker gated, tenant-bound, atomic cost reservation with no direct model/tool execution.';
COMMIT;
