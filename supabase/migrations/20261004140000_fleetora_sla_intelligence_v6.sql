-- Working cross-product SLA/exception operations and governed intelligence proposals.
-- External products send opaque operational IDs and timestamps only; customer data stays local.
BEGIN;

CREATE TABLE IF NOT EXISTS public.external_dispatch_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
  external_job_id text NOT NULL CHECK(length(external_job_id) BETWEEN 1 AND 200),
  job_type text NOT NULL CHECK(length(job_type) BETWEEN 1 AND 80),
  priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
  status text NOT NULL CHECK(length(status) BETWEEN 1 AND 80),
  source_created_at timestamptz NOT NULL,
  scheduled_at timestamptz,
  accepted_at timestamptz,
  arrived_at timestamptz,
  completed_at timestamptz,
  last_event_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,product_key,external_job_id)
);
CREATE INDEX IF NOT EXISTS external_dispatch_jobs_sla_idx
  ON public.external_dispatch_jobs(tenant_id,product_key,status,scheduled_at,last_event_at);

ALTER TABLE public.dispatch_exceptions
  ADD COLUMN IF NOT EXISTS product_key text REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS external_job_id text,
  ADD COLUMN IF NOT EXISTS sla_policy_id uuid REFERENCES public.dispatch_sla_policies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS breach_key text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_note text;
CREATE UNIQUE INDEX IF NOT EXISTS dispatch_exceptions_external_breach_idx
  ON public.dispatch_exceptions(tenant_id,product_key,breach_key)
  WHERE breach_key IS NOT NULL;

ALTER TABLE public.operations_recommendations
  ADD COLUMN IF NOT EXISTS proposal_hash text,
  ADD COLUMN IF NOT EXISTS model_key text,
  ADD COLUMN IF NOT EXISTS policy_key text,
  ADD COLUMN IF NOT EXISTS prompt_template_version text,
  ADD COLUMN IF NOT EXISTS requested_by_service text;
ALTER TABLE public.operations_recommendations
  DROP CONSTRAINT IF EXISTS operations_recommendations_proposal_hash_check;
ALTER TABLE public.operations_recommendations
  ADD CONSTRAINT operations_recommendations_proposal_hash_check
  CHECK(proposal_hash IS NULL OR proposal_hash ~ '^[a-f0-9]{64}$');
CREATE UNIQUE INDEX IF NOT EXISTS operations_recommendations_active_hash_idx
  ON public.operations_recommendations(tenant_id,product_key,proposal_hash)
  WHERE proposal_hash IS NOT NULL AND status IN ('review','approved');

CREATE TABLE IF NOT EXISTS public.operations_recommendation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  recommendation_id uuid NOT NULL REFERENCES public.operations_recommendations(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK(event_type IN ('proposed','approved','dismissed','expired','applied')),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payload_hash text CHECK(payload_hash IS NULL OR payload_hash ~ '^[a-f0-9]{64}$'),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operations_recommendation_events_scope_idx
  ON public.operations_recommendation_events(tenant_id,recommendation_id,created_at);

ALTER TABLE public.external_dispatch_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operations_recommendation_events ENABLE ROW LEVEL SECURITY;
REVOKE INSERT,UPDATE,DELETE ON public.dispatch_exceptions,public.operations_recommendations FROM authenticated;
GRANT SELECT ON public.dispatch_exceptions,public.operations_recommendations TO authenticated;
REVOKE ALL ON public.external_dispatch_jobs,public.operations_recommendation_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.external_dispatch_jobs,public.operations_recommendation_events TO service_role;
GRANT SELECT ON public.external_dispatch_jobs,public.operations_recommendation_events TO authenticated;
CREATE POLICY "external dispatch jobs scoped read" ON public.external_dispatch_jobs
FOR SELECT TO authenticated USING(
  public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid())
);
CREATE POLICY "recommendation events scoped read" ON public.operations_recommendation_events
FOR SELECT TO authenticated USING(
  public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid())
);

CREATE OR REPLACE FUNCTION public.evaluate_external_dispatch_slas(
  _tenant uuid,_product text
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE affected integer := 0; inserted integer;
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role'
    AND NOT public.is_platform_admin(auth.uid()) AND NOT public.can_write(_tenant,auth.uid()) THEN
    RAISE EXCEPTION 'SLA evaluation access denied';
  END IF;

  WITH scoped AS (
    SELECT job.*,policy.id AS policy_id,policy.accept_within_seconds AS threshold_seconds,
      job.source_created_at+make_interval(secs=>policy.accept_within_seconds) AS due_at
    FROM public.external_dispatch_jobs job
    JOIN LATERAL (
      SELECT candidate.* FROM public.dispatch_sla_policies candidate
      WHERE candidate.tenant_id=job.tenant_id AND candidate.product_key=job.product_key AND candidate.active
        AND (candidate.job_type IS NULL OR candidate.job_type=job.job_type)
        AND (candidate.priority IS NULL OR candidate.priority=job.priority)
        AND candidate.accept_within_seconds IS NOT NULL
      ORDER BY ((candidate.job_type IS NOT NULL)::integer+(candidate.priority IS NOT NULL)::integer) DESC,candidate.created_at
      LIMIT 1
    ) policy ON true
    WHERE job.tenant_id=_tenant AND job.product_key=_product AND job.accepted_at IS NULL
      AND job.status IN ('pending','assigned')
  )
  INSERT INTO public.dispatch_exceptions(
    tenant_id,product_key,external_job_id,sla_policy_id,breach_key,exception_type,severity,detail
  ) SELECT tenant_id,product_key,external_job_id,policy_id,
    external_job_id||':accept:'||policy_id::text,'sla_accept_breached',
    CASE WHEN now()>due_at+make_interval(secs=>threshold_seconds) THEN 'critical' ELSE 'warning' END,
    jsonb_build_object('metric','accept','dueAt',due_at,'observedAt',now(),'status',status,'requiresHumanApproval',true)
  FROM scoped WHERE now()>due_at
  ON CONFLICT(tenant_id,product_key,breach_key) WHERE breach_key IS NOT NULL DO UPDATE SET
    severity=EXCLUDED.severity,detail=EXCLUDED.detail,updated_at=now();
  GET DIAGNOSTICS inserted=ROW_COUNT; affected:=affected+inserted;

  WITH scoped AS (
    SELECT job.*,policy.id AS policy_id,policy.arrive_within_seconds AS threshold_seconds,
      job.source_created_at+make_interval(secs=>policy.arrive_within_seconds) AS due_at
    FROM public.external_dispatch_jobs job
    JOIN LATERAL (
      SELECT candidate.* FROM public.dispatch_sla_policies candidate
      WHERE candidate.tenant_id=job.tenant_id AND candidate.product_key=job.product_key AND candidate.active
        AND (candidate.job_type IS NULL OR candidate.job_type=job.job_type)
        AND (candidate.priority IS NULL OR candidate.priority=job.priority)
        AND candidate.arrive_within_seconds IS NOT NULL
      ORDER BY ((candidate.job_type IS NOT NULL)::integer+(candidate.priority IS NOT NULL)::integer) DESC,candidate.created_at
      LIMIT 1
    ) policy ON true
    WHERE job.tenant_id=_tenant AND job.product_key=_product AND job.arrived_at IS NULL
      AND job.status NOT IN ('picked_up','in_transit','delivered','completed','cancelled')
  )
  INSERT INTO public.dispatch_exceptions(
    tenant_id,product_key,external_job_id,sla_policy_id,breach_key,exception_type,severity,detail
  ) SELECT tenant_id,product_key,external_job_id,policy_id,
    external_job_id||':arrive:'||policy_id::text,'sla_arrive_breached',
    CASE WHEN now()>due_at+make_interval(secs=>threshold_seconds) THEN 'critical' ELSE 'warning' END,
    jsonb_build_object('metric','arrive','dueAt',due_at,'observedAt',now(),'status',status,'requiresHumanApproval',true)
  FROM scoped WHERE now()>due_at
  ON CONFLICT(tenant_id,product_key,breach_key) WHERE breach_key IS NOT NULL DO UPDATE SET
    severity=EXCLUDED.severity,detail=EXCLUDED.detail,updated_at=now();
  GET DIAGNOSTICS inserted=ROW_COUNT; affected:=affected+inserted;

  WITH scoped AS (
    SELECT job.*,policy.id AS policy_id,policy.complete_within_seconds AS threshold_seconds,
      COALESCE(job.scheduled_at,job.source_created_at)+make_interval(secs=>policy.complete_within_seconds) AS due_at
    FROM public.external_dispatch_jobs job
    JOIN LATERAL (
      SELECT candidate.* FROM public.dispatch_sla_policies candidate
      WHERE candidate.tenant_id=job.tenant_id AND candidate.product_key=job.product_key AND candidate.active
        AND (candidate.job_type IS NULL OR candidate.job_type=job.job_type)
        AND (candidate.priority IS NULL OR candidate.priority=job.priority)
        AND candidate.complete_within_seconds IS NOT NULL
      ORDER BY ((candidate.job_type IS NOT NULL)::integer+(candidate.priority IS NOT NULL)::integer) DESC,candidate.created_at
      LIMIT 1
    ) policy ON true
    WHERE job.tenant_id=_tenant AND job.product_key=_product AND job.completed_at IS NULL
      AND job.status NOT IN ('delivered','completed','cancelled')
  )
  INSERT INTO public.dispatch_exceptions(
    tenant_id,product_key,external_job_id,sla_policy_id,breach_key,exception_type,severity,detail
  ) SELECT tenant_id,product_key,external_job_id,policy_id,
    external_job_id||':complete:'||policy_id::text,'sla_complete_breached',
    CASE WHEN now()>due_at+make_interval(secs=>threshold_seconds) THEN 'critical' ELSE 'warning' END,
    jsonb_build_object('metric','complete','dueAt',due_at,'observedAt',now(),'status',status,'requiresHumanApproval',true)
  FROM scoped WHERE now()>due_at
  ON CONFLICT(tenant_id,product_key,breach_key) WHERE breach_key IS NOT NULL DO UPDATE SET
    severity=EXCLUDED.severity,detail=EXCLUDED.detail,updated_at=now();
  GET DIAGNOSTICS inserted=ROW_COUNT; affected:=affected+inserted;
  RETURN affected;
END; $$;
REVOKE ALL ON FUNCTION public.evaluate_external_dispatch_slas(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.evaluate_external_dispatch_slas(uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.project_external_dispatch_status(
  _tenant uuid,_product text,_job text,_job_type text,_priority text,_status text,
  _source_created_at timestamptz,_scheduled_at timestamptz,_occurred_at timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN
    RAISE EXCEPTION 'Platform service required';
  END IF;
  INSERT INTO public.external_dispatch_jobs(
    tenant_id,product_key,external_job_id,job_type,priority,status,source_created_at,scheduled_at,
    accepted_at,arrived_at,completed_at,last_event_at
  ) VALUES(
    _tenant,_product,_job,_job_type,_priority,_status,_source_created_at,_scheduled_at,
    CASE WHEN _status IN ('accepted','picked_up','in_transit','delivered','completed') THEN _occurred_at END,
    CASE WHEN _status IN ('picked_up','in_transit','delivered','completed') THEN _occurred_at END,
    CASE WHEN _status IN ('delivered','completed') THEN _occurred_at END,_occurred_at
  ) ON CONFLICT(tenant_id,product_key,external_job_id) DO UPDATE SET
    job_type=EXCLUDED.job_type,priority=EXCLUDED.priority,status=EXCLUDED.status,
    scheduled_at=EXCLUDED.scheduled_at,
    accepted_at=COALESCE(public.external_dispatch_jobs.accepted_at,EXCLUDED.accepted_at),
    arrived_at=COALESCE(public.external_dispatch_jobs.arrived_at,EXCLUDED.arrived_at),
    completed_at=COALESCE(public.external_dispatch_jobs.completed_at,EXCLUDED.completed_at),
    last_event_at=GREATEST(public.external_dispatch_jobs.last_event_at,EXCLUDED.last_event_at),updated_at=now()
  WHERE EXCLUDED.last_event_at>=public.external_dispatch_jobs.last_event_at;
  PERFORM public.evaluate_external_dispatch_slas(_tenant,_product);
END; $$;
REVOKE ALL ON FUNCTION public.project_external_dispatch_status(uuid,text,text,text,text,text,timestamptz,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.project_external_dispatch_status(uuid,text,text,text,text,text,timestamptz,timestamptz,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.review_dispatch_exception(
  _exception uuid,_decision text,_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row public.dispatch_exceptions%rowtype;
BEGIN
  SELECT * INTO row FROM public.dispatch_exceptions WHERE id=_exception FOR UPDATE;
  IF NOT FOUND OR (NOT public.is_platform_admin(auth.uid()) AND NOT public.can_write(row.tenant_id,auth.uid())) THEN
    RAISE EXCEPTION 'Dispatch exception access denied';
  END IF;
  IF _decision NOT IN ('acknowledged','resolved','dismissed') THEN RAISE EXCEPTION 'Invalid exception decision'; END IF;
  IF row.status NOT IN ('open','acknowledged') THEN RAISE EXCEPTION 'Dispatch exception is already closed'; END IF;
  IF _decision IN ('resolved','dismissed') AND length(trim(COALESCE(_note,'')))<3 THEN
    RAISE EXCEPTION 'A resolution note is required';
  END IF;
  UPDATE public.dispatch_exceptions SET status=_decision,reviewed_by=auth.uid(),
    review_note=NULLIF(trim(COALESCE(_note,'')),''),resolved_at=CASE WHEN _decision IN ('resolved','dismissed') THEN now() END,
    updated_at=now() WHERE id=_exception;
  RETURN jsonb_build_object('exceptionId',_exception,'status',_decision);
END; $$;
REVOKE ALL ON FUNCTION public.review_dispatch_exception(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_dispatch_exception(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.audit_operations_recommendation_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE event_name text;
BEGIN
  IF TG_OP='INSERT' THEN event_name:='proposed';
  ELSIF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW;
  ELSE event_name:=NEW.status; END IF;
  IF event_name NOT IN ('proposed','approved','dismissed','expired','applied') THEN RETURN NEW; END IF;
  INSERT INTO public.operations_recommendation_events(
    tenant_id,recommendation_id,event_type,actor_id,payload_hash,detail
  ) VALUES(
    NEW.tenant_id,NEW.id,event_name,auth.uid(),NEW.proposal_hash,
    jsonb_build_object('sourceKind',NEW.source_kind,'policyKey',NEW.policy_key,'modelKey',NEW.model_key)
  );
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_audit_operations_recommendation ON public.operations_recommendations;
CREATE TRIGGER trg_audit_operations_recommendation
AFTER INSERT OR UPDATE OF status ON public.operations_recommendations
FOR EACH ROW EXECUTE FUNCTION public.audit_operations_recommendation_event();

CREATE OR REPLACE FUNCTION public.review_operations_recommendation(_recommendation uuid,_decision text,_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row public.operations_recommendations%rowtype;
BEGIN
  SELECT * INTO row FROM public.operations_recommendations WHERE id=_recommendation FOR UPDATE;
  IF NOT FOUND OR (NOT public.can_write(row.tenant_id,auth.uid()) AND NOT public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Operations recommendation access denied';
  END IF;
  IF _decision NOT IN ('approved','dismissed') THEN RAISE EXCEPTION 'Review decision must be approved or dismissed'; END IF;
  IF row.status<>'review' OR (row.expires_at IS NOT NULL AND row.expires_at<=now()) THEN
    RAISE EXCEPTION 'Operations recommendation is not reviewable';
  END IF;
  UPDATE public.operations_recommendations SET status=_decision,reviewed_by=auth.uid(),reviewed_at=now(),
    review_note=NULLIF(trim(COALESCE(_note,'')),''),updated_at=now() WHERE id=_recommendation;
END; $$;
REVOKE ALL ON FUNCTION public.review_operations_recommendation(uuid,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.review_operations_recommendation(uuid,text,text) TO authenticated;

COMMIT;
