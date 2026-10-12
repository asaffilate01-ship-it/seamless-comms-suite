-- Omniqora AI Factory phase 2: approved-setup MCP requests and atomic
-- budgeted agent job creation. An MCP shortlist is NOT a usable connection.
-- All model prices require independently reviewed provider evidence.
BEGIN;

CREATE TABLE public.mcp_setup_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
 registry_name text NOT NULL CHECK(length(registry_name) BETWEEN 3 AND 160 AND registry_name ~ '^[A-Za-z0-9._/-]+$'),
 registry_version text NOT NULL CHECK(length(registry_version) BETWEEN 1 AND 80),
 reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 500),
 status text NOT NULL DEFAULT 'requested' CHECK(status IN('requested','shortlisted','rejected','revoked')),
 requested_by uuid NOT NULL REFERENCES auth.users(id),
 reviewed_by uuid REFERENCES auth.users(id),
 review_note text,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,registry_name,registry_version)
);
CREATE INDEX mcp_setup_requests_admin_idx ON public.mcp_setup_requests(status,created_at DESC);

CREATE TABLE public.ai_reviewed_model_rates (
 provider_key text NOT NULL REFERENCES public.provider_catalogue(provider_key),
 model_key text NOT NULL,
 rate_version text NOT NULL,
 currency text NOT NULL CHECK(currency ~ '^(GBP|EUR|USD)$'),
 input_minor_per_million bigint NOT NULL CHECK(input_minor_per_million>=0),
 cached_input_minor_per_million bigint CHECK(cached_input_minor_per_million>=0),
 output_minor_per_million bigint NOT NULL CHECK(output_minor_per_million>=0),
 minimum_risk_grade text NOT NULL CHECK(minimum_risk_grade IN('standard','sensitive','regulated')),
 supported_regions text[] NOT NULL DEFAULT '{}',
 evaluation_passed boolean NOT NULL DEFAULT false,
 evidence_url text NOT NULL CHECK(evidence_url ~ '^https://' AND length(evidence_url)<=700),
 verified_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','approved','revoked')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 PRIMARY KEY(provider_key,model_key,rate_version,currency)
);
CREATE INDEX ai_reviewed_rates_selection_idx ON public.ai_reviewed_model_rates(provider_key,model_key,currency,status,verified_at DESC);

CREATE TABLE public.ai_spend_budgets (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key),
 period_month date NOT NULL,
 currency text NOT NULL CHECK(currency ~ '^(GBP|EUR|USD)$'),
 limit_minor bigint NOT NULL CHECK(limit_minor>=0 AND limit_minor<=1000000000),
 reserved_minor bigint NOT NULL DEFAULT 0 CHECK(reserved_minor>=0),
 spent_minor bigint NOT NULL DEFAULT 0 CHECK(spent_minor>=0),
 updated_by uuid REFERENCES auth.users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,product_key,period_month,currency)
);

CREATE TABLE public.ai_budgeted_run_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key),
 run_id uuid NOT NULL UNIQUE REFERENCES public.ai_agent_runs(id) ON DELETE RESTRICT,
 use_case_id uuid NOT NULL REFERENCES public.ai_use_cases(id) ON DELETE RESTRICT,
 period_month date NOT NULL,
 currency text NOT NULL CHECK(currency ~ '^(GBP|EUR|USD)$'),
 reserved_minor bigint NOT NULL CHECK(reserved_minor>0),
 actual_minor bigint,
 provider_key text NOT NULL,
 model_key text NOT NULL,
 rate_version text NOT NULL,
 idempotency_key uuid NOT NULL,
 request_hash text NOT NULL,
 status text NOT NULL DEFAULT 'reserved' CHECK(status IN('reserved','settled','released','overage')),
 provider_receipt_ref text,
 created_at timestamptz NOT NULL DEFAULT now(),
 settled_at timestamptz,
 UNIQUE(tenant_id,product_key,idempotency_key),
 FOREIGN KEY (tenant_id,product_key,period_month,currency)
  REFERENCES public.ai_spend_budgets(tenant_id,product_key,period_month,currency)
);
CREATE INDEX ai_budgeted_reservation_scope_idx ON public.ai_budgeted_run_reservations(tenant_id,product_key,period_month,status);

-- Browser roles can READ scoped metadata but cannot forge verification, reviews,
-- tariff approvals, budget reservations or actual spend receipts.
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['mcp_setup_requests','ai_reviewed_model_rates','ai_spend_budgets','ai_budgeted_run_reservations'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',tab);
 END LOOP;
END $$;

GRANT SELECT ON public.mcp_setup_requests,public.ai_spend_budgets,public.ai_budgeted_run_reservations TO authenticated;
GRANT SELECT ON public.ai_reviewed_model_rates TO authenticated;

CREATE POLICY "mcp request scoped read" ON public.mcp_setup_requests
 FOR SELECT TO authenticated USING (
  public.is_platform_admin(auth.uid()) OR EXISTS(
   SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=mcp_setup_requests.tenant_id
    AND m.user_id=auth.uid() AND m.role IN ('owner','admin'))
 );
CREATE POLICY "ai reviewed price read" ON public.ai_reviewed_model_rates
 FOR SELECT TO authenticated USING(status='approved');
CREATE POLICY "ai budget scoped read" ON public.ai_spend_budgets
 FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
CREATE POLICY "ai reservation scoped read" ON public.ai_budgeted_run_reservations
 FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));

CREATE OR REPLACE FUNCTION public.request_mcp_setup(
 _tenant uuid,_product text,_name text,_version text,_reason text
) RETURNS public.mcp_setup_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rec public.mcp_setup_requests;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 IF NOT(public.is_platform_admin(auth.uid()) OR EXISTS(
  SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=_tenant AND m.user_id=auth.uid()
    AND m.role IN('owner','admin'))) THEN RAISE EXCEPTION 'Tenant administrator required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tenant_products p WHERE p.tenant_id=_tenant
    AND p.product_key=_product AND p.status='active') THEN
  RAISE EXCEPTION 'An active tenant product is required';
 END IF;
 IF _name IS NULL OR length(_name) NOT BETWEEN 3 AND 160 OR _name !~ '^[A-Za-z0-9._/-]+$'
   OR _version IS NULL OR length(_version) NOT BETWEEN 1 AND 80
   OR _reason IS NULL OR length(trim(_reason)) NOT BETWEEN 10 AND 500 THEN
  RAISE EXCEPTION 'Invalid MCP setup request';
 END IF;
 INSERT INTO public.mcp_setup_requests(tenant_id,product_key,registry_name,registry_version,reason,requested_by)
 VALUES(_tenant,_product,_name,_version,trim(_reason),auth.uid())
 ON CONFLICT(tenant_id,product_key,registry_name,registry_version) DO NOTHING
 RETURNING * INTO rec;
 IF rec.id IS NULL THEN
  SELECT * INTO STRICT rec FROM public.mcp_setup_requests
    WHERE tenant_id=_tenant AND product_key=_product AND registry_name=_name AND registry_version=_version;
 END IF;
 RETURN rec;
END $$;

CREATE OR REPLACE FUNCTION public.review_mcp_setup(
 _request uuid,_decision text,_note text
) RETURNS public.mcp_setup_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rec public.mcp_setup_requests;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
  RAISE EXCEPTION 'Platform approval required'; END IF;
 IF _decision NOT IN('shortlisted','rejected','revoked') OR
  _note IS NULL OR length(trim(_note)) NOT BETWEEN 16 AND 1500 THEN
  RAISE EXCEPTION 'Reviewed decision and evidence note required'; END IF;
 SELECT * INTO STRICT rec FROM public.mcp_setup_requests WHERE id=_request FOR UPDATE;
 IF rec.requested_by=auth.uid() THEN RAISE EXCEPTION 'Independent reviewer required'; END IF;
 IF rec.status NOT IN('requested','shortlisted') THEN RAISE EXCEPTION 'MCP request is closed'; END IF;
 UPDATE public.mcp_setup_requests
  SET status=_decision,review_note=trim(_note),reviewed_by=auth.uid(),reviewed_at=now()
  WHERE id=_request RETURNING * INTO rec;
 -- shortlisted = eligible for secure OAuth/credential setup; never 'connected'
 RETURN rec;
END $$;

CREATE OR REPLACE FUNCTION public.configure_ai_spend_budget(
 _tenant uuid,_product text,_currency text,_limit bigint
) RETURNS public.ai_spend_budgets
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE month_start date; rec public.ai_spend_budgets;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 IF NOT(public.is_platform_admin(auth.uid()) OR EXISTS(
  SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=_tenant AND m.user_id=auth.uid()
    AND m.role IN('owner','admin'))) THEN RAISE EXCEPTION 'Tenant administrator required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tenant_products WHERE tenant_id=_tenant AND product_key=_product AND status='active') THEN
  RAISE EXCEPTION 'An active tenant product is required'; END IF;
 IF _currency NOT IN('GBP','USD','EUR') OR _limit IS NULL OR _limit<0 OR _limit>1000000000 THEN
  RAISE EXCEPTION 'Invalid AI spend limit'; END IF;
 month_start:=date_trunc('month',now() AT TIME ZONE 'UTC')::date;
 INSERT INTO public.ai_spend_budgets(tenant_id,product_key,period_month,currency,limit_minor,updated_by)
 VALUES(_tenant,_product,month_start,_currency,_limit,auth.uid())
 ON CONFLICT DO NOTHING;
 SELECT * INTO STRICT rec FROM public.ai_spend_budgets
 WHERE tenant_id=_tenant AND product_key=_product AND period_month=month_start AND currency=_currency FOR UPDATE;
 IF _limit<rec.reserved_minor+rec.spent_minor THEN
  RAISE EXCEPTION 'Limit cannot fall below reserved and incurred charges'; END IF;
 UPDATE public.ai_spend_budgets SET limit_minor=_limit,updated_by=auth.uid(),updated_at=now()
 WHERE tenant_id=_tenant AND product_key=_product AND period_month=month_start AND currency=_currency RETURNING * INTO rec;
 RETURN rec;
END $$;

-- Atomic budget reservation, AI run creation and queue insertion. Every failure
-- rolls back all three. Does NOT itself execute an AI model or MCP tool.
CREATE OR REPLACE FUNCTION public.queue_budgeted_ai_agent(
 _tenant uuid,_product text,_use_case uuid,_profile text,_goal text,
 _provider text,_model text,_currency text,_input_tokens bigint,
 _cached_tokens bigint,_output_tokens bigint,_tool_ceiling bigint,
 _max_steps integer,_idempotency uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 member_role text; uc public.ai_use_cases; tariff public.ai_reviewed_model_rates;
 account public.ai_spend_budgets; existing public.ai_budgeted_run_reservations;
 new_run uuid; new_job uuid; new_reservation uuid; estimate bigint; h text; month_start date;
 risk_required integer; risk_supported integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT role INTO member_role FROM public.tenant_members WHERE tenant_id=_tenant AND user_id=auth.uid();
 IF member_role NOT IN('owner','admin','agent') AND NOT public.is_platform_admin(auth.uid()) THEN
  RAISE EXCEPTION 'Tenant agent access required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tenant_products WHERE tenant_id=_tenant AND product_key=_product AND status='active') THEN
  RAISE EXCEPTION 'Active tenant SaaS required'; END IF;
 IF NOT public.has_tenant_entitlement(_tenant,'omniqora.intelligence-runtime') THEN
  RAISE EXCEPTION 'AI runtime entitlement required'; END IF;
 IF _currency NOT IN('GBP','USD','EUR') OR _idempotency IS NULL OR
    _goal IS NULL OR length(trim(_goal)) NOT BETWEEN 4 AND 5000 OR
    _profile NOT IN('discovery','finance','technical','compliance','product','transaction','accounting','tax','operations') OR
    _max_steps NOT BETWEEN 1 AND 32 OR
    _input_tokens IS NULL OR _input_tokens NOT BETWEEN 0 AND 10000000 OR
    _cached_tokens IS NULL OR _cached_tokens<0 OR _cached_tokens>_input_tokens OR
    _output_tokens IS NULL OR _output_tokens NOT BETWEEN 0 AND 10000000 OR
    _tool_ceiling IS NULL OR _tool_ceiling NOT BETWEEN 0 AND 100000000 THEN
  RAISE EXCEPTION 'Invalid bounded AI budget request';
 END IF;
 SELECT * INTO STRICT uc FROM public.ai_use_cases
  WHERE id=_use_case AND tenant_id=_tenant AND product_key=_product;
 IF uc.status NOT IN('approved','pilot') OR uc.approved_by IS NULL THEN
  RAISE EXCEPTION 'Independently approved AI use case required'; END IF;
 IF COALESCE(uc.provider_route->>'factoryBlueprint','')='' THEN
  RAISE EXCEPTION 'Use the approved agent factory blueprint'; END IF;
 IF EXISTS(SELECT 1 FROM public.ai_use_cases WHERE id=_use_case AND owner_user_id=approved_by) THEN
  RAISE EXCEPTION 'Independent AI use-case approval required'; END IF;
 h:=md5(concat_ws('|',_use_case::text,_profile,trim(_goal),_provider,_model,_currency,
                  _input_tokens::text,_cached_tokens::text,_output_tokens::text,_tool_ceiling::text,_max_steps::text));
 SELECT * INTO existing FROM public.ai_budgeted_run_reservations
  WHERE tenant_id=_tenant AND product_key=_product AND idempotency_key=_idempotency;
 IF existing.id IS NOT NULL THEN
  IF existing.request_hash<>h THEN RAISE EXCEPTION 'Idempotency payload changed'; END IF;
  RETURN jsonb_build_object('runId',existing.run_id,'reservationId',existing.id,'reservedMinor',existing.reserved_minor,
   'currency',existing.currency,'status',existing.status,'alreadyExists',true);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.provider_bindings b WHERE b.tenant_id=_tenant AND b.product_key=_product
  AND b.provider_key=_provider AND b.environment='production' AND b.status='active'
  AND b.last_verified_at>=now()-interval '24 hours') THEN
  RAISE EXCEPTION 'Fresh production provider verification required'; END IF;
 SELECT * INTO tariff FROM public.ai_reviewed_model_rates WHERE provider_key=_provider
  AND model_key=_model AND currency=_currency AND status='approved' AND evaluation_passed
  AND verified_at<=now() AND verified_at>=now()-interval '30 days'
  ORDER BY verified_at DESC,rate_version DESC LIMIT 1;
 IF tariff.rate_version IS NULL THEN RAISE EXCEPTION 'No current evaluated model price'; END IF;
 IF COALESCE(array_length(tariff.supported_regions,1),0)>0 AND NOT
  ((SELECT country_code FROM public.tenants WHERE id=_tenant)=ANY(tariff.supported_regions)) THEN
  RAISE EXCEPTION 'Model not approved for tenant country'; END IF;
 risk_required:=CASE WHEN uc.risk_level='high' THEN 3 WHEN uc.risk_level='review' THEN 2 ELSE 1 END;
 risk_supported:=CASE tariff.minimum_risk_grade WHEN 'regulated' THEN 3 WHEN 'sensitive' THEN 2 ELSE 1 END;
 IF risk_supported<risk_required THEN RAISE EXCEPTION 'Model risk rating insufficient'; END IF;
 estimate:=ceil((_input_tokens-_cached_tokens)::numeric*tariff.input_minor_per_million/1000000)::bigint
  +ceil(_cached_tokens::numeric*COALESCE(tariff.cached_input_minor_per_million,tariff.input_minor_per_million)/1000000)::bigint
  +ceil(_output_tokens::numeric*tariff.output_minor_per_million/1000000)::bigint+_tool_ceiling;
 IF estimate<=0 THEN RAISE EXCEPTION 'A positive verified reservation is required'; END IF;
 IF estimate>100000000 THEN RAISE EXCEPTION 'Maximum AI run charge ceiling exceeded'; END IF;
 month_start:=date_trunc('month',now() AT TIME ZONE 'UTC')::date;
 SELECT * INTO account FROM public.ai_spend_budgets
  WHERE tenant_id=_tenant AND product_key=_product AND period_month=month_start AND currency=_currency FOR UPDATE;
 IF account.tenant_id IS NULL THEN RAISE EXCEPTION 'No monthly AI budget has been approved'; END IF;
 IF account.spent_minor+account.reserved_minor+estimate>account.limit_minor THEN
  RAISE EXCEPTION 'AI monthly budget exceeded'; END IF;
 IF uc.monthly_budget_minor IS NOT NULL AND
  (SELECT COALESCE(sum(CASE WHEN status='reserved' THEN reserved_minor ELSE COALESCE(actual_minor,0) END),0)
   FROM public.ai_budgeted_run_reservations WHERE tenant_id=_tenant AND product_key=_product
    AND use_case_id=_use_case AND period_month=month_start AND status<>'released')+estimate>uc.monthly_budget_minor THEN
  RAISE EXCEPTION 'AI use-case monthly budget exceeded'; END IF;
 UPDATE public.ai_spend_budgets SET reserved_minor=reserved_minor+estimate,updated_at=now()
  WHERE tenant_id=_tenant AND product_key=_product AND period_month=month_start AND currency=_currency;
 INSERT INTO public.ai_agent_runs(tenant_id,product_key,use_case_id,profile,goal,
  status,max_steps,provider_key,model,input_version,initiated_by)
 VALUES(_tenant,_product,_use_case,_profile,trim(_goal),'queued',_max_steps,_provider,_model,
        'factory-budget-v1',auth.uid()) RETURNING id INTO new_run;
 INSERT INTO public.ai_budgeted_run_reservations
  (tenant_id,product_key,run_id,use_case_id,period_month,currency,reserved_minor,provider_key,
   model_key,rate_version,idempotency_key,request_hash)
 VALUES(_tenant,_product,new_run,_use_case,month_start,_currency,estimate,_provider,_model,
  tariff.rate_version,_idempotency,h) RETURNING id INTO new_reservation;
 INSERT INTO public.intelligence_jobs(tenant_id,product_key,job_type,subject_type,subject_id,
  priority,status,input,requirements)
 VALUES(_tenant,_product,'agent.run','ai_agent_run',new_run::text,'normal','queued',
  jsonb_build_object('runId',new_run,'profile',_profile,'goal',trim(_goal),'maxSteps',_max_steps,
   'providerKey',_provider,'model',_model),
  jsonb_build_object('budgetReservationId',new_reservation,'rateVersion',tariff.rate_version,
   'reservedMinor',estimate,'currency',_currency,'allowUnverifiedMcp',false,
   'allowedTools',uc.allowed_tools,'approvalForWrites',true,'sourcePermissionsRequired',true))
 RETURNING id INTO new_job;
 RETURN jsonb_build_object('runId',new_run,'jobId',new_job,'reservationId',new_reservation,
  'reservedMinor',estimate,'currency',_currency,'status','queued','alreadyExists',false);
END $$;

-- Only the trusted server worker/service role may settle actual charge receipts.
-- An over-budget provider charge remains visible as 'overage', rather than
-- silently pretending the approved reservation was sufficient.
CREATE OR REPLACE FUNCTION public.settle_budgeted_ai_agent(
 _run uuid,_actual_minor bigint,_receipt_ref text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE res public.ai_budgeted_run_reservations;spent bigint;new_status text;
BEGIN
 IF _actual_minor IS NULL OR _actual_minor<0 OR _actual_minor>1000000000 OR
    _receipt_ref IS NULL OR length(trim(_receipt_ref)) NOT BETWEEN 6 AND 200 THEN
  RAISE EXCEPTION 'Invalid model provider billing receipt'; END IF;
 SELECT * INTO STRICT res FROM public.ai_budgeted_run_reservations WHERE run_id=_run FOR UPDATE;
 IF res.status<>'reserved' THEN
  IF res.provider_receipt_ref=_receipt_ref AND res.actual_minor=_actual_minor THEN
   RETURN jsonb_build_object('runId',_run,'status',res.status,'actualMinor',res.actual_minor,'alreadyExists',true);
  END IF;
  RAISE EXCEPTION 'Reservation was already reconciled';
 END IF;
 PERFORM 1 FROM public.ai_spend_budgets WHERE tenant_id=res.tenant_id AND product_key=res.product_key
  AND period_month=res.period_month AND currency=res.currency FOR UPDATE;
 new_status:=CASE WHEN _actual_minor>res.reserved_minor THEN 'overage' ELSE 'settled' END;
 UPDATE public.ai_budgeted_run_reservations
  SET actual_minor=_actual_minor,status=new_status,provider_receipt_ref=trim(_receipt_ref),settled_at=now()
  WHERE id=res.id;
 UPDATE public.ai_spend_budgets
  SET reserved_minor=reserved_minor-res.reserved_minor,spent_minor=spent_minor+_actual_minor,updated_at=now()
  WHERE tenant_id=res.tenant_id AND product_key=res.product_key AND period_month=res.period_month AND currency=res.currency;
 RETURN jsonb_build_object('runId',_run,'status',new_status,'actualMinor',_actual_minor,'alreadyExists',false);
END $$;

REVOKE ALL ON FUNCTION public.request_mcp_setup(uuid,text,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.review_mcp_setup(uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.configure_ai_spend_budget(uuid,text,text,bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.queue_budgeted_ai_agent(uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint,bigint,integer,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.settle_budgeted_ai_agent(uuid,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_mcp_setup(uuid,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_mcp_setup(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.configure_ai_spend_budget(uuid,text,text,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.queue_budgeted_ai_agent(uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint,bigint,integer,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_budgeted_ai_agent(uuid,bigint,text) TO service_role;
COMMIT;
