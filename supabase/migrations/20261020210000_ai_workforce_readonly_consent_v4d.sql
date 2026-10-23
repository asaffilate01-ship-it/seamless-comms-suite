-- Omniqora AI Workforce 4D: real read-only source consent and controlled pilot metadata.
-- Nothing is activated by migration; CRM source is first-party aggregated only.
BEGIN;

CREATE TABLE public.ai_workforce_readonly_sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 product_key text NOT NULL,
 source_key text NOT NULL DEFAULT 'omniqora.crm.leads-summary.v1'
  CHECK(source_key='omniqora.crm.leads-summary.v1'),
 status text NOT NULL DEFAULT 'requested'
  CHECK(status IN ('requested','approved','rejected','revoked')),
 classification text NOT NULL DEFAULT 'aggregate_internal'
  CHECK(classification='aggregate_internal'),
 purpose text NOT NULL CHECK(length(btrim(purpose)) BETWEEN 20 AND 700),
 requester_id uuid NOT NULL REFERENCES auth.users(id),
 reviewer_id uuid REFERENCES auth.users(id),
 review_note text CHECK(review_note IS NULL OR length(review_note)<=1000),
 reviewed_at timestamptz,
 expires_at timestamptz,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>=1),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,source_key),
 UNIQUE(id,tenant_id,product_key),
 FOREIGN KEY(tenant_id,product_key) REFERENCES public.tenant_products(tenant_id,product_key) ON DELETE CASCADE,
 CHECK(product_key='omniqora')
);

CREATE TABLE public.ai_workforce_readonly_pilots (
 tenant_id uuid NOT NULL,
 product_key text NOT NULL CHECK(product_key='omniqora'),
 enabled boolean NOT NULL DEFAULT false,
 expires_at timestamptz NOT NULL,
 daily_limit integer NOT NULL DEFAULT 2 CHECK(daily_limit BETWEEN 1 AND 8),
 max_run_cost_minor bigint NOT NULL DEFAULT 100 CHECK(max_run_cost_minor BETWEEN 1 AND 5000),
 operator_reference text NOT NULL CHECK(length(btrim(operator_reference)) BETWEEN 12 AND 240),
 permitted_source text NOT NULL DEFAULT 'omniqora.crm.leads-summary.v1'
  CHECK(permitted_source='omniqora.crm.leads-summary.v1'),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,product_key),
 FOREIGN KEY(tenant_id,product_key) REFERENCES public.tenant_products(tenant_id,product_key) ON DELETE CASCADE
);

-- This record associates the EXISTING canonical run/job/reservation with the approved
-- employee, task and RLS-filtered aggregate snapshot; it is not another run ledger.
CREATE TABLE public.ai_workforce_readonly_admissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 product_key text NOT NULL CHECK(product_key='omniqora'),
 employee_id uuid NOT NULL,
 task_id uuid NOT NULL,
 source_id uuid NOT NULL,
 employee_revision integer NOT NULL CHECK(employee_revision>0),
 task_revision integer NOT NULL CHECK(task_revision>0),
 source_revision integer NOT NULL CHECK(source_revision>0),
 run_id uuid NOT NULL UNIQUE REFERENCES public.ai_agent_runs(id) ON DELETE RESTRICT,
 job_id uuid NOT NULL UNIQUE REFERENCES public.intelligence_jobs(id) ON DELETE RESTRICT,
 reservation_id uuid NOT NULL UNIQUE REFERENCES public.ai_budgeted_run_reservations(id) ON DELETE RESTRICT,
 provider_key text NOT NULL,
 model_key text NOT NULL,
 max_input_tokens integer NOT NULL CHECK(max_input_tokens BETWEEN 64 AND 1200),
 max_output_tokens integer NOT NULL CHECK(max_output_tokens BETWEEN 32 AND 256),
 source_snapshot jsonb NOT NULL CHECK(jsonb_typeof(source_snapshot)='object'),
 snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^[a-f0-9]{32}$'),
 idempotency_key uuid NOT NULL,
 request_hash text NOT NULL,
 status text NOT NULL DEFAULT 'queued'
  CHECK(status IN('queued','processing','waiting_review','completed','rejected','failed',
                  'cancelled','reconciliation_required')),
 requested_by uuid NOT NULL REFERENCES auth.users(id),
 worker_ref text,
 response_ref text,
 review_by uuid REFERENCES auth.users(id),
 reviewed_at timestamptz,
 review_note text,
 admitted_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 FOREIGN KEY(employee_id,tenant_id,product_key)
  REFERENCES public.ai_employees(id,tenant_id,product_key) ON DELETE CASCADE,
 FOREIGN KEY(task_id,tenant_id,product_key)
  REFERENCES public.ai_employee_tasks(id,tenant_id,product_key) ON DELETE CASCADE,
 FOREIGN KEY(source_id,tenant_id,product_key)
  REFERENCES public.ai_workforce_readonly_sources(id,tenant_id,product_key) ON DELETE RESTRICT,
 UNIQUE(tenant_id,product_key,idempotency_key)
);
CREATE INDEX workforce_readonly_admission_queue_idx
 ON public.ai_workforce_readonly_admissions(tenant_id,product_key,status,admitted_at);
CREATE INDEX workforce_readonly_employee_idx
 ON public.ai_workforce_readonly_admissions(tenant_id,employee_id,admitted_at DESC);

-- No direct browser mutations, no anonymous access, no cross-tenant reads.
DO $security$ DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['ai_workforce_readonly_sources','ai_workforce_readonly_pilots',
                            'ai_workforce_readonly_admissions'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',tab);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',tab);
  EXECUTE format($p$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
   public.is_platform_admin(auth.uid()) OR EXISTS(
     SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=%I.tenant_id
       AND m.user_id=auth.uid() AND m.role IN('owner','admin'))
  )$p$,'workforce readonly admin read '||tab,tab,tab);
 END LOOP;
END $security$;

CREATE FUNCTION public.request_ai_workforce_readonly_source(
 _tenant uuid,_product text,_purpose text)
RETURNS public.ai_workforce_readonly_sources
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $request$
DECLARE out_row public.ai_workforce_readonly_sources;
BEGIN
 PERFORM public.ai_workforce_require_admin(_tenant,_product);
 IF _product<>'omniqora' OR length(btrim(COALESCE(_purpose,''))) NOT BETWEEN 20 AND 700 THEN
  RAISE EXCEPTION 'Only the approved first-party CRM aggregate source is supported';
 END IF;
 INSERT INTO public.ai_workforce_readonly_sources
 (tenant_id,product_key,source_key,purpose,requester_id)
 VALUES(_tenant,_product,'omniqora.crm.leads-summary.v1',btrim(_purpose),auth.uid())
 ON CONFLICT(tenant_id,product_key,source_key) DO UPDATE SET
  status='requested',purpose=EXCLUDED.purpose,requester_id=auth.uid(),
  reviewer_id=NULL,review_note=NULL,reviewed_at=NULL,expires_at=NULL,
  revision=public.ai_workforce_readonly_sources.revision+1,updated_at=now()
 RETURNING * INTO out_row;
 RETURN out_row;
END $request$;

CREATE FUNCTION public.review_ai_workforce_readonly_source(
 _tenant uuid,_product text,_source uuid,_decision text,_note text)
RETURNS public.ai_workforce_readonly_sources
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $review$
DECLARE s public.ai_workforce_readonly_sources; result public.ai_workforce_readonly_sources;
BEGIN
 PERFORM public.ai_workforce_require_admin(_tenant,_product);
 SELECT * INTO STRICT s FROM public.ai_workforce_readonly_sources
 WHERE id=_source AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 IF _decision NOT IN('approved','rejected','revoked') OR
    length(btrim(COALESCE(_note,''))) NOT BETWEEN 12 AND 1000 THEN
  RAISE EXCEPTION 'Invalid source consent review';
 END IF;
 IF _decision IN('approved','rejected') AND
   (s.status<>'requested' OR s.requester_id=auth.uid()) THEN
  RAISE EXCEPTION 'Independent CRM data-access reviewer required';
 END IF;
 IF _decision='revoked' AND s.status<>'approved' THEN
  RAISE EXCEPTION 'Only approved CRM source access may be revoked';
 END IF;
 UPDATE public.ai_workforce_readonly_sources SET
  status=_decision,reviewer_id=auth.uid(),review_note=btrim(_note),reviewed_at=now(),
  expires_at=CASE WHEN _decision='approved' THEN now()+interval '24 hours' ELSE NULL END,
  revision=s.revision+1,updated_at=now()
 WHERE id=s.id RETURNING * INTO result;
 RETURN result;
END $review$;

-- Service-role operator alone can switch on a first-party real CRM pilot.
-- Never connected to a user-facing button or a production deployment workflow.
CREATE FUNCTION public.configure_ai_workforce_readonly_pilot(
 _tenant uuid,_product text,_enabled boolean,_expires_at timestamptz,
 _daily_limit integer,_max_run_cost_minor bigint,_operator_reference text)
RETURNS public.ai_workforce_readonly_pilots
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $pilot$
DECLARE result public.ai_workforce_readonly_pilots;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'Privileged read-only pilot operator required';
 END IF;
 IF _product<>'omniqora' OR NOT EXISTS(
  SELECT 1 FROM public.tenant_products p WHERE p.tenant_id=_tenant
   AND p.product_key=_product AND p.status='active') OR
  NOT public.has_tenant_entitlement(_tenant,'omniqora.ai-workforce') OR
  NOT public.has_tenant_entitlement(_tenant,'omniqora.intelligence-runtime') THEN
  RAISE EXCEPTION 'Verified tenant and both AI entitlements required';
 END IF;
 IF _enabled IS NULL OR _expires_at IS NULL OR
    (_enabled AND (_expires_at<=now() OR _expires_at>now()+interval '24 hours')) OR
    _daily_limit IS NULL OR _daily_limit NOT BETWEEN 1 AND 8 OR
    _max_run_cost_minor IS NULL OR _max_run_cost_minor NOT BETWEEN 1 AND 5000 OR
    length(btrim(COALESCE(_operator_reference,''))) NOT BETWEEN 12 AND 240 THEN
  RAISE EXCEPTION 'Invalid operator approval or pilot bounds';
 END IF;
 INSERT INTO public.ai_workforce_readonly_pilots(
 tenant_id,product_key,enabled,expires_at,daily_limit,max_run_cost_minor,operator_reference)
 VALUES(_tenant,_product,_enabled,_expires_at,_daily_limit,_max_run_cost_minor,btrim(_operator_reference))
 ON CONFLICT(tenant_id,product_key) DO UPDATE SET
  enabled=EXCLUDED.enabled,expires_at=EXCLUDED.expires_at,
  daily_limit=EXCLUDED.daily_limit,max_run_cost_minor=EXCLUDED.max_run_cost_minor,
  operator_reference=EXCLUDED.operator_reference,updated_at=now()
 RETURNING * INTO result;
 RETURN result;
END $pilot$;

REVOKE ALL ON FUNCTION public.request_ai_workforce_readonly_source(uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.review_ai_workforce_readonly_source(uuid,text,uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.configure_ai_workforce_readonly_pilot(uuid,text,boolean,timestamptz,integer,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_ai_workforce_readonly_source(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_ai_workforce_readonly_source(uuid,text,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.configure_ai_workforce_readonly_pilot(uuid,text,boolean,timestamptz,integer,bigint,text) TO service_role;

COMMIT;
