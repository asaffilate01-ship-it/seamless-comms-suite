-- Finvessa TreasuryOS Phase 3: scoped report fingerprint/review metadata ONLY.
-- This does NOT ingest or retain raw bank, GL, forecast, policy, or model data.
-- No external banking connections, transfers or regulatory approval are created.
BEGIN;

CREATE TABLE public.treasury_review_cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL DEFAULT 'finvessa' CHECK(product_key = 'finvessa'),
 report_date date NOT NULL,
 report_mode text NOT NULL CHECK(report_mode IN ('synthetic_demo','local_import')),
 source_status text NOT NULL CHECK(source_status IN ('blocked','review_required','checked')),
 risk_status text NOT NULL CHECK(risk_status IN ('blocked','unassessed','breach','review_required','within_policy_assumptions')),
 report_digest text NOT NULL CHECK(report_digest ~ '^[a-f0-9]{64}$'),
 policy_digest text NOT NULL CHECK(policy_digest ~ '^[a-f0-9]{64}$'),
 account_count integer NOT NULL CHECK(account_count BETWEEN 0 AND 20000),
 reconciled_count integer NOT NULL CHECK(reconciled_count BETWEEN 0 AND 20000),
 blocking_count integer NOT NULL CHECK(blocking_count BETWEEN 0 AND 20000),
 warning_count integer NOT NULL CHECK(warning_count BETWEEN 0 AND 20000),
 breach_count integer NOT NULL CHECK(breach_count BETWEEN 0 AND 20000),
 status text NOT NULL DEFAULT 'submitted'
   CHECK(status IN ('submitted','acknowledged','correction_requested')),
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
 reviewer_note text CHECK(reviewer_note IS NULL OR length(reviewer_note) BETWEEN 12 AND 1200),
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,tenant_id),
 UNIQUE(tenant_id,report_digest,policy_digest),
 CHECK(reconciled_count<=account_count),
 CHECK(
   (status='submitted' AND reviewed_by IS NULL AND reviewed_at IS NULL AND reviewer_note IS NULL)
   OR (status<>'submitted' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND reviewer_note IS NOT NULL AND reviewed_by<>created_by)
 )
);
CREATE INDEX treasury_review_cases_tenant_idx
  ON public.treasury_review_cases(tenant_id,created_at DESC);

CREATE TABLE public.treasury_review_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 case_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 event_type text NOT NULL CHECK(event_type IN ('submitted','acknowledged','correction_requested')),
 note text CHECK(note IS NULL OR length(note) BETWEEN 12 AND 1200),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(case_id,tenant_id) REFERENCES public.treasury_review_cases(id,tenant_id) ON DELETE RESTRICT,
 UNIQUE(case_id,event_type)
);
CREATE INDEX treasury_review_events_case_idx ON public.treasury_review_events(tenant_id,case_id,created_at);

-- No direct writes for browser-authenticated roles. Only validated RPCs may mutate.
ALTER TABLE public.treasury_review_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treasury_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.treasury_review_cases,public.treasury_review_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.treasury_review_cases,public.treasury_review_events TO authenticated;
GRANT ALL ON public.treasury_review_cases,public.treasury_review_events TO service_role;

CREATE POLICY "treasury case member read" ON public.treasury_review_cases
 FOR SELECT TO authenticated USING (
  (public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))
  AND EXISTS(SELECT 1 FROM public.tenant_products tp
    WHERE tp.tenant_id=treasury_review_cases.tenant_id
      AND tp.product_key='finvessa' AND tp.status='active')
);
CREATE POLICY "treasury event member read" ON public.treasury_review_events
 FOR SELECT TO authenticated USING (
  (public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))
  AND EXISTS(SELECT 1 FROM public.tenant_products tp
    WHERE tp.tenant_id=treasury_review_events.tenant_id
      AND tp.product_key='finvessa' AND tp.status='active')
);

-- All submitted values are unverified client-generated fingerprints and counts.
-- This case records a human review request, NOT verified numerical correctness.
CREATE OR REPLACE FUNCTION public.submit_treasury_review(
 _tenant uuid, _report_date date, _mode text, _source_status text,
 _risk_status text, _report_digest text, _policy_digest text,
 _accounts integer, _reconciled integer, _blocking integer,
 _warnings integer, _breaches integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text; result_id uuid; existed boolean:=false; current_status text:='submitted';
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT role INTO role_name FROM public.tenant_members
  WHERE tenant_id=_tenant AND user_id=auth.uid();
 IF COALESCE(role_name,'') NOT IN('owner','admin','agent')
   AND NOT public.is_platform_admin(auth.uid()) THEN
  RAISE EXCEPTION 'Tenant treasury submit permission required';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tenant_products tp
   WHERE tp.tenant_id=_tenant AND tp.product_key='finvessa' AND tp.status='active') THEN
  RAISE EXCEPTION 'Active Finvessa tenant product required';
 END IF;
 IF _report_date IS NULL OR _report_date > current_date OR _report_date < DATE '2000-01-01'
   OR _mode NOT IN ('synthetic_demo','local_import')
   OR _source_status NOT IN ('blocked','review_required','checked')
   OR _risk_status NOT IN ('blocked','unassessed','breach','review_required','within_policy_assumptions')
   OR COALESCE(_report_digest,'') !~ '^[a-f0-9]{64}$'
   OR COALESCE(_policy_digest,'') !~ '^[a-f0-9]{64}$'
   OR _accounts IS NULL OR _accounts NOT BETWEEN 0 AND 20000
   OR _reconciled IS NULL OR _reconciled NOT BETWEEN 0 AND _accounts
   OR _blocking IS NULL OR _blocking NOT BETWEEN 0 AND 20000
   OR _warnings IS NULL OR _warnings NOT BETWEEN 0 AND 20000
   OR _breaches IS NULL OR _breaches NOT BETWEEN 0 AND 20000 THEN
    RAISE EXCEPTION 'Invalid or unsupported treasury review metadata';
 END IF;
 INSERT INTO public.treasury_review_cases(
  tenant_id,report_date,report_mode,source_status,risk_status,report_digest,
  policy_digest,account_count,reconciled_count,blocking_count,warning_count,breach_count,created_by
 ) VALUES(
  _tenant,_report_date,_mode,_source_status,_risk_status,_report_digest,
  _policy_digest,_accounts,_reconciled,_blocking,_warnings,_breaches,auth.uid()
 ) ON CONFLICT(tenant_id,report_digest,policy_digest) DO NOTHING
 RETURNING id INTO result_id;
 IF result_id IS NULL THEN
  existed:=true;
  SELECT id,status INTO STRICT result_id,current_status FROM public.treasury_review_cases
    WHERE tenant_id=_tenant AND report_digest=_report_digest AND policy_digest=_policy_digest;
 ELSE
  INSERT INTO public.treasury_review_events(tenant_id,case_id,actor_id,event_type)
  VALUES(_tenant,result_id,auth.uid(),'submitted');
 END IF;
 RETURN jsonb_build_object('caseId',result_id,'status',current_status,'alreadyExists',existed);
END $$;

CREATE OR REPLACE FUNCTION public.review_treasury_case(
 _tenant uuid, _case uuid, _decision text, _note text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text; c public.treasury_review_cases;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT role INTO role_name FROM public.tenant_members
  WHERE tenant_id=_tenant AND user_id=auth.uid();
 IF COALESCE(role_name,'') NOT IN('owner','admin')
   AND NOT public.is_platform_admin(auth.uid()) THEN
  RAISE EXCEPTION 'Independent tenant treasury reviewer required';
 END IF;
 IF _decision IS NULL OR _decision NOT IN('acknowledged','correction_requested')
   OR _note IS NULL OR length(trim(_note)) NOT BETWEEN 12 AND 1200 THEN
  RAISE EXCEPTION 'Valid review decision and explanation required';
 END IF;
 SELECT * INTO STRICT c FROM public.treasury_review_cases
   WHERE id=_case AND tenant_id=_tenant AND product_key='finvessa' FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.tenant_products tp
   WHERE tp.tenant_id=_tenant AND tp.product_key='finvessa' AND tp.status='active') THEN
  RAISE EXCEPTION 'Active Finvessa tenant product required';
 END IF;
 IF c.created_by=auth.uid() THEN
  RAISE EXCEPTION 'Segregation of duties: submitter cannot review own case';
 END IF;
 IF c.status<>'submitted' THEN
  RAISE EXCEPTION 'Case is already reviewed; append no duplicate decision';
 END IF;
 UPDATE public.treasury_review_cases SET
   status=_decision,reviewed_by=auth.uid(),reviewer_note=trim(_note),reviewed_at=now()
   WHERE id=_case AND tenant_id=_tenant;
 INSERT INTO public.treasury_review_events(
   tenant_id,case_id,actor_id,event_type,note
 ) VALUES(_tenant,_case,auth.uid(),_decision,trim(_note));
 RETURN jsonb_build_object('caseId',_case,'status',_decision,'reviewed',true);
END $$;

REVOKE ALL ON FUNCTION public.submit_treasury_review(
 uuid,date,text,text,text,text,text,integer,integer,integer,integer,integer
) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_treasury_review(
 uuid,date,text,text,text,text,text,integer,integer,integer,integer,integer
) TO authenticated;
REVOKE ALL ON FUNCTION public.review_treasury_case(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_treasury_case(uuid,uuid,text,text) TO authenticated;

COMMIT;
