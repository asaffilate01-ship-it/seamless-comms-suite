-- Governed Intelligence job queue for typed AI work across Omniqora modules.
BEGIN;

CREATE TABLE IF NOT EXISTS public.intelligence_jobs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  source_event_id text,
  priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
  status text NOT NULL DEFAULT 'queued'
    CHECK(status IN ('queued','processing','waiting_result','completed','failed','cancelled')),
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_key text,
  model text,
  worker_key_id text,
  result_ref text,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS intelligence_jobs_event_type_uq
 ON public.intelligence_jobs(tenant_id,job_type,source_event_id)
 WHERE source_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS intelligence_jobs_claim_idx
 ON public.intelligence_jobs(status,next_attempt_at,priority,created_at);

ALTER TABLE public.intelligence_jobs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.intelligence_jobs TO authenticated;
GRANT ALL ON public.intelligence_jobs TO service_role;
DROP POLICY IF EXISTS "intelligence jobs tenant read" ON public.intelligence_jobs;
CREATE POLICY "intelligence jobs tenant read" ON public.intelligence_jobs FOR SELECT TO authenticated
 USING(public.is_tenant_member(tenant_id,auth.uid()));

DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.intelligence_jobs;
CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.intelligence_jobs
FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at();

CREATE OR REPLACE FUNCTION public.claim_intelligence_jobs(
 _limit integer DEFAULT 10,_job_types text[] DEFAULT NULL,_worker_key text DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
 RETURN QUERY
 WITH jobs AS(
  SELECT j.id
  FROM public.intelligence_jobs j
  WHERE (
    (j.status='queued' AND j.next_attempt_at<=now())
    OR (j.status='processing' AND j.locked_at<now()-interval '10 minutes')
  )
  AND (_job_types IS NULL OR j.job_type=ANY(_job_types))
  ORDER BY
   CASE j.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
   j.created_at
  LIMIT LEAST(GREATEST(_limit,1),50)
  FOR UPDATE SKIP LOCKED
 )
 UPDATE public.intelligence_jobs j
 SET status='processing',attempts=j.attempts+1,locked_at=now(),started_at=COALESCE(j.started_at,now()),
     worker_key_id=_worker_key,updated_at=now()
 FROM jobs x
 WHERE j.id=x.id
 RETURNING jsonb_build_object(
  'id',j.id,'tenantId',j.tenant_id,'tenantProductId',j.tenant_product_id,'jobType',j.job_type,
  'subjectType',j.subject_type,'subjectId',j.subject_id,'priority',j.priority,
  'input',j.input,'requirements',j.requirements,'attempts',j.attempts
 );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_intelligence_jobs(integer,text[],text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_intelligence_jobs(integer,text[],text) TO service_role;


CREATE OR REPLACE FUNCTION public.claim_intelligence_jobs_for_scope(
 _tenant uuid,_tenant_product uuid,_limit integer DEFAULT 10,_job_types text[] DEFAULT NULL,_worker_key text DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $claim$
BEGIN
 RETURN QUERY
 WITH jobs AS(
  SELECT j.id
  FROM public.intelligence_jobs j
  WHERE j.tenant_id=_tenant
    AND j.tenant_product_id=_tenant_product
    AND (
      (j.status='queued' AND j.next_attempt_at<=now())
      OR (j.status='processing' AND j.locked_at<now()-interval '10 minutes')
    )
    AND (_job_types IS NULL OR j.job_type=ANY(_job_types))
  ORDER BY
   CASE j.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
   j.created_at
  LIMIT LEAST(GREATEST(_limit,1),50)
  FOR UPDATE SKIP LOCKED
 )
 UPDATE public.intelligence_jobs j
 SET status='processing',attempts=j.attempts+1,locked_at=now(),started_at=COALESCE(j.started_at,now()),
     worker_key_id=_worker_key,updated_at=now()
 FROM jobs x
 WHERE j.id=x.id
 RETURNING jsonb_build_object(
  'id',j.id,'tenantId',j.tenant_id,'tenantProductId',j.tenant_product_id,'jobType',j.job_type,
  'subjectType',j.subject_type,'subjectId',j.subject_id,'priority',j.priority,
  'input',j.input,'requirements',j.requirements,'attempts',j.attempts
 );
END;
$claim$;
REVOKE EXECUTE ON FUNCTION public.claim_intelligence_jobs_for_scope(uuid,uuid,integer,text[],text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_intelligence_jobs_for_scope(uuid,uuid,integer,text[],text)
 TO service_role;

CREATE OR REPLACE FUNCTION public.finish_intelligence_job(
 _job uuid,_success boolean,_result_ref text DEFAULT NULL,_provider_key text DEFAULT NULL,
 _model text DEFAULT NULL,_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE j public.intelligence_jobs;
BEGIN
 SELECT * INTO j FROM public.intelligence_jobs WHERE id=_job FOR UPDATE;
 IF NOT FOUND OR j.status<>'processing' THEN RAISE EXCEPTION 'intelligence_job_not_processing'; END IF;
 IF _success THEN
  UPDATE public.intelligence_jobs SET
   status='completed',result_ref=_result_ref,provider_key=_provider_key,model=_model,
   completed_at=now(),locked_at=NULL,last_error=NULL,updated_at=now()
  WHERE id=_job;
 ELSIF j.attempts>=5 THEN
  UPDATE public.intelligence_jobs SET
   status='failed',last_error=left(COALESCE(_error,'intelligence job failed'),2000),
   completed_at=now(),locked_at=NULL,updated_at=now()
  WHERE id=_job;
 ELSE
  UPDATE public.intelligence_jobs SET
   status='queued',next_attempt_at=now()+(power(2,LEAST(j.attempts,8))::text||' minutes')::interval,
   last_error=left(COALESCE(_error,'intelligence job failed'),2000),locked_at=NULL,updated_at=now()
  WHERE id=_job;
 END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.finish_intelligence_job(uuid,boolean,text,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_intelligence_job(uuid,boolean,text,text,text,text)
 TO service_role;

COMMIT;
